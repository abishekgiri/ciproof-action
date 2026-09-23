/**
 * Orchestration for the CIProof action. This is the only module that performs
 * side effects (reads inputs, runs the CLI, writes the summary, emits
 * annotations, sets outputs, posts the PR comment). All decision logic lives in
 * the pure modules it calls, which keeps that logic unit-testable.
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { InputError, parseInputs, type ActionInputs } from "./inputs.js";
import { runCheck, runDiff } from "./ciproof.js";
import {
  actionableFindings,
  countsFor,
  parseJsonReport,
  verdictFromExitCode,
  type ReportSummary,
} from "./report.js";
import { renderComment, renderSummary, type RenderModel } from "./render.js";
import { planAnnotations } from "./annotations.js";
import { computeOutputs } from "./outputs.js";
import { decideFailure } from "./decision.js";
import {
  evaluateCommentGate,
  isPermissionError,
  upsertComment,
  type CommentApi,
  type CommentTarget,
  type IssueComment,
} from "./comment.js";

export async function run(): Promise<void> {
  let inputs: ActionInputs;
  try {
    inputs = parseInputs(readRawInputs());
  } catch (err) {
    if (err instanceof InputError) {
      core.setFailed(`Invalid input: ${err.message}`);
      return;
    }
    throw err;
  }

  if (inputs.githubToken) {
    core.setSecret(inputs.githubToken);
  }

  const runUrl = workflowRunUrl();

  if (inputs.command === "diff") {
    await runDiffCommand(inputs, runUrl);
    return;
  }
  await runCheckCommand(inputs, runUrl);
}

async function runCheckCommand(
  inputs: ActionInputs,
  runUrl: string | undefined,
): Promise<void> {
  const result = await runCheck({
    version: inputs.ciproofVersion,
    workspace: inputs.workingDirectory,
  });
  const report = parseJsonReport(result.reportJson);
  const verdict = verdictFromExitCode(result.exitCode);
  const counts = countsFor(report);
  const findings = actionableFindings(report);

  const model: RenderModel = {
    verdict,
    counts,
    findings,
    ...(runUrl ? { runUrl } : {}),
    ...(verdict === "error"
      ? { errorOutput: result.stderr || result.stdout }
      : {}),
  };

  await writeSummary(renderSummary(model));
  emitAnnotations(findings);
  setOutputs(verdict, counts, report, result.reportJson);

  if (inputs.comment) {
    await maybeComment(inputs, model);
  }

  finish(verdict, inputs, counts);
}

async function runDiffCommand(
  inputs: ActionInputs,
  runUrl: string | undefined,
): Promise<void> {
  const result = await runDiff({
    version: inputs.ciproofVersion,
    workspace: inputs.workingDirectory,
    revisions: inputs.revisions,
  });
  const verdict = verdictFromExitCode(result.exitCode);
  const counts: ReportSummary = { refuted: 0, unknown: 0, passed: 0 };

  const model: RenderModel = {
    verdict,
    counts,
    findings: [],
    diffText: result.stdout,
    ...(runUrl ? { runUrl } : {}),
    ...(verdict === "error"
      ? { errorOutput: result.stderr || result.stdout }
      : {}),
  };

  await writeSummary(renderSummary(model));
  setOutputs(verdict, counts, null, null);

  if (inputs.comment) {
    await maybeComment(inputs, model);
  }

  // diff never refutes; only a git/usage error (exit 2 -> "error") fails.
  const decision = decideFailure(verdict, {
    failOnRefuted: inputs.failOnRefuted,
    failOnUnknown: inputs.failOnUnknown,
  });
  if (decision.fail) {
    core.setFailed(decision.reason ?? "CIProof diff failed.");
  }
}

// ---------------------------------------------------------------------------
// side-effect helpers
// ---------------------------------------------------------------------------

function readRawInputs(): Parameters<typeof parseInputs>[0] {
  return {
    command: core.getInput("command"),
    ciproofVersion: core.getInput("ciproof-version"),
    revisions: core.getInput("revisions"),
    failOnRefuted: core.getInput("fail-on-refuted"),
    failOnUnknown: core.getInput("fail-on-unknown"),
    comment: core.getInput("comment"),
    githubToken: core.getInput("github-token"),
    workingDirectory: core.getInput("working-directory"),
  };
}

async function writeSummary(markdown: string): Promise<void> {
  try {
    await core.summary.addRaw(markdown).write();
  } catch {
    // No GITHUB_STEP_SUMMARY (e.g. local run); fall back to the log.
    core.info(markdown);
  }
}

function emitAnnotations(
  findings: Parameters<typeof planAnnotations>[0],
): void {
  for (const a of planAnnotations(findings)) {
    const props = {
      ...(a.title ? { title: a.title } : {}),
      ...(a.file ? { file: a.file } : {}),
      ...(a.startLine !== undefined ? { startLine: a.startLine } : {}),
      ...(a.startColumn !== undefined ? { startColumn: a.startColumn } : {}),
    };
    if (a.level === "error") {
      core.error(a.message, props);
    } else {
      core.warning(a.message, props);
    }
  }
}

function setOutputs(
  verdict: Parameters<typeof computeOutputs>[0],
  counts: ReportSummary,
  report: Parameters<typeof computeOutputs>[2],
  rawReportJson: string | null,
): void {
  const out = computeOutputs(verdict, counts, report, rawReportJson);
  core.setOutput("verdict", out.verdict);
  core.setOutput("refuted-count", String(out.refutedCount));
  core.setOutput("unknown-count", String(out.unknownCount));
  core.setOutput("passed-count", String(out.passedCount));
  core.setOutput("report-json", out.reportJson);
}

async function maybeComment(
  inputs: ActionInputs,
  model: RenderModel,
): Promise<void> {
  const ctx = github.context;
  const issueNumber = ctx.payload.pull_request?.number;
  const gate = evaluateCommentGate({
    commentEnabled: inputs.comment,
    eventName: ctx.eventName,
    issueNumber,
  });
  if (!gate.attempt) {
    if (gate.skipReason) {
      core.notice(gate.skipReason);
    }
    return;
  }

  const target: CommentTarget = {
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    issueNumber: gate.issueNumber as number,
  };
  const api = octokitCommentApi(inputs.githubToken);
  if (!api) {
    core.notice(
      "PR comment skipped: no github-token available to authenticate the " +
        "GitHub API.",
    );
    return;
  }

  try {
    const res = await upsertComment(api, target, renderComment(model));
    core.info(
      res.action === "updated"
        ? `Updated existing CIProof PR comment (#${res.commentId}).`
        : "Created CIProof PR comment.",
    );
  } catch (err) {
    if (isPermissionError(err)) {
      core.notice(
        "PR comment skipped because this workflow token does not have " +
          "pull-request write permission. Grant `pull-requests: write` to " +
          "enable comments (fork pull requests cannot receive comments).",
      );
      return;
    }
    core.warning(
      `PR comment could not be posted: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function octokitCommentApi(token: string): CommentApi | null {
  if (!token) {
    return null;
  }
  const octokit = github.getOctokit(token);
  return {
    async listComments(t): Promise<IssueComment[]> {
      return octokit.paginate(octokit.rest.issues.listComments, {
        owner: t.owner,
        repo: t.repo,
        issue_number: t.issueNumber,
        per_page: 100,
      });
    },
    async updateComment(t, commentId, body): Promise<void> {
      await octokit.rest.issues.updateComment({
        owner: t.owner,
        repo: t.repo,
        comment_id: commentId,
        body,
      });
    },
    async createComment(t, body): Promise<void> {
      await octokit.rest.issues.createComment({
        owner: t.owner,
        repo: t.repo,
        issue_number: t.issueNumber,
        body,
      });
    },
  };
}

function finish(
  verdict: Parameters<typeof decideFailure>[0],
  inputs: ActionInputs,
  counts: ReportSummary,
): void {
  const decision = decideFailure(verdict, {
    failOnRefuted: inputs.failOnRefuted,
    failOnUnknown: inputs.failOnUnknown,
  });
  if (decision.fail) {
    core.setFailed(decision.reason ?? "CIProof failed.");
    return;
  }
  if (verdict === "unknown") {
    core.warning(
      `CIProof analysis incomplete: ${counts.unknown} UNKNOWN finding(s). ` +
        "UNKNOWN is not a pass.",
    );
  }
}

function workflowRunUrl(): string | undefined {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (server && repo && runId) {
    return `${server}/${repo}/actions/runs/${runId}`;
  }
  return undefined;
}
