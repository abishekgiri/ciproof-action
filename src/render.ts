/**
 * Pure rendering of the job summary and the PR comment from a verdict + report.
 *
 * All values that originate from the analyzed repository (finding titles,
 * messages, counterexample scenarios) are treated as untrusted text: they are
 * HTML-escaped and rendered inside <pre> blocks, so repository content cannot
 * inject markup, break out of a code fence, or forge action UI.
 */

import type {
  ReportCounterexample,
  ReportFinding,
  ReportSummary,
  Verdict,
} from "./report.js";

/** Hidden marker used to find and update this action's own PR comment. */
export const COMMENT_MARKER = "<!-- ciproof-report -->";

/** Cap on how many findings are rendered, to keep output compact. */
export const MAX_RENDERED_FINDINGS = 10;

const FOOTER = ["No workflow was executed.", "No secrets were required."];

export interface RenderModel {
  verdict: Verdict;
  counts: ReportSummary;
  findings: ReportFinding[];
  /** Present for `diff`; the CLI's textual behavior report. */
  diffText?: string;
  /** Present when the run failed to complete (verdict === "error"). */
  errorOutput?: string;
  /** Link back to the workflow run, when known. */
  runUrl?: string;
}

/** Escape the five HTML-significant characters. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Job summary (GITHUB_STEP_SUMMARY)
// ---------------------------------------------------------------------------

/** Render the Markdown job summary for a run. */
export function renderSummary(model: RenderModel): string {
  if (model.diffText !== undefined) {
    return renderDiffSummary(model);
  }
  switch (model.verdict) {
    case "refuted":
      return renderRefutedSummary(model);
    case "unknown":
      return renderUnknownSummary(model);
    case "clean":
      return renderCleanSummary();
    case "error":
      return renderErrorSummary(model);
  }
}

function renderRefutedSummary(model: RenderModel): string {
  const lines = [
    "# CIProof",
    "",
    "Status: REFUTED",
    "",
    countsBlock(model.counts),
  ];
  for (const finding of limit(model.findings)) {
    lines.push("", `## ${escapeHtml(finding.title)}`, "");
    lines.push(escapeHtml(finding.message));
    const block = counterexamplePre(finding.counterexample);
    if (block) {
      lines.push("", "Counterexample:", "", block);
    }
  }
  lines.push("", ...FOOTER);
  return lines.join("\n") + "\n";
}

function renderUnknownSummary(model: RenderModel): string {
  const lines = [
    "# CIProof",
    "",
    "? Analysis incomplete",
    "",
    "CIProof could not soundly determine all relevant behavior.",
    "",
    "UNKNOWN is not a pass.",
    "",
    countsBlock(model.counts),
  ];
  for (const finding of limit(model.findings)) {
    lines.push("", `## ${escapeHtml(finding.title)}`, "");
    lines.push(escapeHtml(finding.message));
    for (const reason of finding.unknownReasons.slice(0, 5)) {
      lines.push(`- ${escapeHtml(reason)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function renderCleanSummary(): string {
  return (
    ["# CIProof", "", "✓ No violation found in the modeled scenarios."].join(
      "\n",
    ) + "\n"
  );
}

function renderErrorSummary(model: RenderModel): string {
  const lines = [
    "# CIProof",
    "",
    "✗ CIProof could not complete the analysis.",
    "",
    "This is treated as a failure (configuration, CLI, or model error).",
  ];
  if (model.errorOutput && model.errorOutput.trim().length > 0) {
    lines.push("", "<pre>", escapeHtml(clip(model.errorOutput)), "</pre>");
  }
  return lines.join("\n") + "\n";
}

function renderDiffSummary(model: RenderModel): string {
  const lines = ["# CIProof — behavior diff", ""];
  if (model.verdict === "error") {
    lines.push(
      "✗ CIProof could not compute the diff.",
      "",
      "If the base revision is missing, the checkout may need `fetch-depth: 0`.",
    );
    if (model.errorOutput && model.errorOutput.trim().length > 0) {
      lines.push("", "<pre>", escapeHtml(clip(model.errorOutput)), "</pre>");
    }
  } else {
    lines.push("<pre>", escapeHtml(clip(model.diffText ?? "")), "</pre>");
    lines.push("", ...FOOTER);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// PR comment
// ---------------------------------------------------------------------------

/** Render the PR comment body. Always ends with the hidden marker. */
export function renderComment(model: RenderModel): string {
  const lines: string[] = ["## CIProof", ""];

  if (model.diffText !== undefined) {
    if (model.verdict === "error") {
      lines.push("⚠️ CIProof could not compute the behavior diff.");
    } else {
      lines.push("### Behavior diff", "", "<pre>");
      lines.push(escapeHtml(clip(model.diffText)));
      lines.push("</pre>");
    }
  } else if (model.verdict === "error") {
    lines.push("⚠️ CIProof could not complete the analysis.");
  } else if (model.verdict === "clean") {
    lines.push("✅ No violation found in the modeled scenarios.");
  } else {
    lines.push(commentCountsLine(model.counts));
    for (const finding of limit(model.findings)) {
      lines.push("", `### ${escapeHtml(finding.title)}`, "");
      lines.push(escapeHtml(finding.message));
      const block = counterexamplePre(finding.counterexample);
      if (block) {
        lines.push(
          "",
          "<details>",
          "<summary>Counterexample</summary>",
          "",
          block,
          "",
          "</details>",
        );
      }
    }
    if (model.counts.unknown > 0) {
      lines.push(
        "",
        "`UNKNOWN` means CIProof could not soundly model all relevant behavior.",
      );
    }
  }

  if (model.runUrl) {
    lines.push("", `[View workflow run](${model.runUrl})`);
  }
  lines.push("", COMMENT_MARKER);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function countsBlock(counts: ReportSummary): string {
  return [
    `${counts.refuted} invariant${counts.refuted === 1 ? "" : "s"} refuted`,
    `${counts.unknown} unknown`,
    `${counts.passed} passed`,
  ].join("\n");
}

function commentCountsLine(counts: ReportSummary): string {
  const parts: string[] = [];
  if (counts.refuted > 0) {
    parts.push(
      `❌ ${counts.refuted} invariant${counts.refuted === 1 ? "" : "s"} refuted`,
    );
  }
  if (counts.unknown > 0) {
    parts.push(`⚠️ ${counts.unknown} unknown`);
  }
  parts.push(`✅ ${counts.passed} passed`);
  return parts.join("\n");
}

/** Render a counterexample as an escaped <pre> block, or "" if none. */
export function counterexamplePre(
  ce: ReportCounterexample | null | undefined,
): string {
  if (!ce) {
    return "";
  }
  const lines: string[] = [];
  for (const [key, value] of Object.entries(ce.scenario)) {
    lines.push(`${key}: ${value}`);
  }
  if (ce.execution && Object.keys(ce.execution).length > 0) {
    lines.push("");
    for (const [job, state] of Object.entries(ce.execution)) {
      lines.push(`${job}: ${String(state).toUpperCase()}`);
    }
  }
  if (lines.length === 0) {
    return "";
  }
  return `<pre>\n${escapeHtml(lines.join("\n"))}\n</pre>`;
}

function limit(findings: ReportFinding[]): ReportFinding[] {
  return findings.slice(0, MAX_RENDERED_FINDINGS);
}

function clip(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}
