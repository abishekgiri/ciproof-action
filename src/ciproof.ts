/**
 * Invoke the published CIProof CLI from npm. The action is a thin wrapper: it
 * never re-implements analysis and never runs anything from the analyzed
 * repository.
 *
 * Safety properties:
 *   - CIProof is fetched by an exact version (or "latest" when opted in) via
 *     `npm exec` and run from a throwaway directory, so npm never reads the
 *     analyzed repo's package.json or runs its lifecycle scripts.
 *   - `-C <workspace>` points CIProof at the checked-out files; CIProof only
 *     reads workflow/config files as data.
 *   - Arguments are passed as an argv array (no shell), so repository content
 *     cannot inject a command.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getExecOutput } from "@actions/exec";

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Raw JSON report text (check mode), or null if none was produced. */
  reportJson: string | null;
}

/** The npm executable name for the current platform. */
export function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/** Build the argv for `npm exec` of `ciproof check --format json`. */
export function buildCheckArgs(
  version: string,
  workspace: string,
  reportPath: string,
): string[] {
  return [
    "exec",
    "--yes",
    `ciproof@${version}`,
    "--",
    "check",
    "-C",
    workspace,
    "--format",
    "json",
    "--output",
    reportPath,
  ];
}

/** Build the argv for `npm exec` of `ciproof diff <revisions>`. */
export function buildDiffArgs(
  version: string,
  workspace: string,
  revisions: string,
): string[] {
  return [
    "exec",
    "--yes",
    `ciproof@${version}`,
    "--",
    "diff",
    revisions,
    "-C",
    workspace,
  ];
}

export interface RunOptions {
  version: string;
  workspace: string;
}

/** Run `ciproof check --format json` and read back the structured report. */
export async function runCheck(options: RunOptions): Promise<RunResult> {
  const scratch = mkdtempSync(join(tmpdir(), "ciproof-action-"));
  const reportPath = join(scratch, "report.json");
  try {
    // Resolve the workspace to an absolute path relative to the current cwd (the
    // GITHUB_WORKSPACE the action step runs in) BEFORE handing it to a process
    // whose cwd is the throwaway scratch directory.
    const args = buildCheckArgs(
      options.version,
      resolve(options.workspace),
      reportPath,
    );
    const res = await getExecOutput(npmCommand(), args, {
      cwd: scratch,
      ignoreReturnCode: true,
      silent: false,
    });
    let reportJson: string | null = null;
    try {
      reportJson = readFileSync(reportPath, "utf8");
    } catch {
      reportJson = null;
    }
    return {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      reportJson,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Run `ciproof diff <revisions>` and capture its human-readable report. */
export async function runDiff(
  options: RunOptions & { revisions: string },
): Promise<RunResult> {
  const scratch = mkdtempSync(join(tmpdir(), "ciproof-action-"));
  try {
    const args = buildDiffArgs(
      options.version,
      resolve(options.workspace),
      options.revisions,
    );
    const res = await getExecOutput(npmCommand(), args, {
      cwd: scratch,
      ignoreReturnCode: true,
      silent: false,
    });
    return {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      reportJson: null,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
