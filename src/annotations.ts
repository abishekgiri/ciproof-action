/**
 * Turn findings into GitHub workflow annotations.
 *
 * Mapping: REFUTED -> error, UNKNOWN -> warning, passed -> nothing. A file/line
 * is attached only when CIProof actually reported a source location; locations
 * are never fabricated.
 */

import type { ReportFinding } from "./report.js";

export interface AnnotationPlan {
  level: "error" | "warning";
  message: string;
  file?: string;
  startLine?: number;
  startColumn?: number;
  title?: string;
}

/** Build the ordered list of annotations to emit for a report's findings. */
export function planAnnotations(
  findings: readonly ReportFinding[],
): AnnotationPlan[] {
  const plans: AnnotationPlan[] = [];
  for (const finding of findings) {
    if (finding.verdict === "no-violation") {
      continue;
    }
    const level = finding.verdict === "refuted" ? "error" : "warning";
    const message = annotationMessage(finding);
    const loc = finding.location;
    plans.push({
      level,
      message,
      title: `CIProof: ${finding.title}`,
      ...(loc?.file ? { file: loc.file } : {}),
      ...(loc?.line !== undefined ? { startLine: loc.line } : {}),
      ...(loc?.column !== undefined ? { startColumn: loc.column } : {}),
    });
  }
  return plans;
}

function annotationMessage(finding: ReportFinding): string {
  const scope = finding.job
    ? `${finding.workflow ?? ""} (job: ${finding.job})`.trim()
    : (finding.workflow ?? "");
  const prefix = scope ? `${scope}: ` : "";
  return `${prefix}${finding.message}`;
}
