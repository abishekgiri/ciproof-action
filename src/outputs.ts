/**
 * Compute the action's output values from a verdict + report.
 *
 * Outputs are small scalars by design. `report-json` is exposed only when it is
 * small enough to be safe as a step output; a larger report is omitted (with the
 * job summary and, optionally, the PR comment carrying the detail instead).
 */

import type { JsonReport, ReportSummary, Verdict } from "./report.js";

/** Maximum size (characters) of `report-json` before it is omitted. */
export const MAX_REPORT_JSON_CHARS = 100_000;

export interface OutputValues {
  verdict: Verdict;
  refutedCount: number;
  unknownCount: number;
  passedCount: number;
  reportJson: string;
}

export function computeOutputs(
  verdict: Verdict,
  counts: ReportSummary,
  report: JsonReport | null,
  rawReportJson: string | null,
): OutputValues {
  const reportJson =
    rawReportJson &&
    report !== null &&
    rawReportJson.length <= MAX_REPORT_JSON_CHARS
      ? rawReportJson
      : "";
  return {
    verdict,
    refutedCount: counts.refuted,
    unknownCount: counts.unknown,
    passedCount: counts.passed,
    reportJson,
  };
}
