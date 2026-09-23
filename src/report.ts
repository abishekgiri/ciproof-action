/**
 * Types and pure helpers for the CIProof JSON v1 report contract.
 *
 * This action NEVER re-derives CIProof's semantics. It treats the CLI as the one
 * source of truth: it reads the structured `check --format json` output (version
 * 1) and the process exit code, and maps them to a stable action verdict.
 *
 * The exit code — not the JSON — is authoritative for the verdict, and it is
 * mapped 1:1 without reinterpretation (see `verdictFromExitCode`).
 */

/** The CIProof JSON report contract version this action understands. */
export const SUPPORTED_JSON_VERSION = 1;

/** Externally-facing verdict the action exposes as an output. */
export type Verdict = "refuted" | "unknown" | "clean" | "error";

/** Per-finding verdict as emitted in the JSON report's `results`. */
export type FindingVerdict = "refuted" | "unknown" | "no-violation";

export interface ReportLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface ReportCounterexample {
  scenario: Record<string, string>;
  execution?: Record<string, string>;
}

export interface ReportFinding {
  id: string;
  rule: string;
  ruleId: string;
  verdict: FindingVerdict;
  title: string;
  message: string;
  workflow: string | null;
  job: string | null;
  location: ReportLocation | null;
  counterexample: ReportCounterexample | null;
  unknownReasons: string[];
  fingerprint: string;
}

export interface ReportSummary {
  refuted: number;
  unknown: number;
  passed: number;
}

export interface JsonReport {
  version: number;
  summary: ReportSummary;
  results: ReportFinding[];
  notes?: string[];
}

/**
 * CIProof CLI exit-code contract (identical across --format). This action
 * preserves it exactly and never reinterprets a code:
 *   0  clean            no violated invariant
 *   1  refuted          a concrete counterexample exists
 *   2  config/CLI/IO    usage or I/O error
 *   3  parse/model      a workflow could not be modeled
 *   4  unknown          analysis incomplete (UNKNOWN); not a pass
 */
export const EXIT = {
  CLEAN: 0,
  REFUTED: 1,
  CONFIG_ERROR: 2,
  PARSE_ERROR: 3,
  UNKNOWN: 4,
} as const;

/** Map the CLI exit code to a verdict. 1:1, no reinterpretation. */
export function verdictFromExitCode(code: number): Verdict {
  switch (code) {
    case EXIT.CLEAN:
      return "clean";
    case EXIT.REFUTED:
      return "refuted";
    case EXIT.UNKNOWN:
      return "unknown";
    case EXIT.CONFIG_ERROR:
    case EXIT.PARSE_ERROR:
    default:
      return "error";
  }
}

/**
 * Parse and validate a CIProof JSON v1 report. Returns `null` when the payload
 * is absent or not a recognizable v1 report; the caller then relies on the exit
 * code alone (e.g. a config error writes diagnostics to stderr, not JSON).
 */
export function parseJsonReport(
  raw: string | undefined | null,
): JsonReport | null {
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== SUPPORTED_JSON_VERSION) {
    return null;
  }
  const summary = obj.summary as Record<string, unknown> | undefined;
  if (typeof summary !== "object" || summary === null) {
    return null;
  }
  const results = Array.isArray(obj.results)
    ? (obj.results as ReportFinding[])
    : [];
  return {
    version: SUPPORTED_JSON_VERSION,
    summary: {
      refuted: toCount(summary.refuted),
      unknown: toCount(summary.unknown),
      passed: toCount(summary.passed),
    },
    results,
    ...(Array.isArray(obj.notes) ? { notes: obj.notes as string[] } : {}),
  };
}

/** Counts to expose as outputs. Falls back to zeros without a valid report. */
export function countsFor(report: JsonReport | null): ReportSummary {
  if (!report) {
    return { refuted: 0, unknown: 0, passed: 0 };
  }
  return report.summary;
}

/** Findings worth surfacing (refuted first, then unknown), stable order. */
export function actionableFindings(report: JsonReport | null): ReportFinding[] {
  if (!report) {
    return [];
  }
  const rank = (v: FindingVerdict): number =>
    v === "refuted" ? 0 : v === "unknown" ? 1 : 2;
  return [...report.results]
    .filter((f) => f.verdict !== "no-violation")
    .sort((a, b) => rank(a.verdict) - rank(b.verdict));
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
