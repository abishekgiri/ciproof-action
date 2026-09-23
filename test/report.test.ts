import { describe, expect, it } from "vitest";
import {
  actionableFindings,
  countsFor,
  EXIT,
  parseJsonReport,
  SUPPORTED_JSON_VERSION,
  verdictFromExitCode,
} from "../src/report.js";
import {
  CLEAN_JSON,
  REFUTED_JSON,
  UNKNOWN_JSON,
  REFUTED_REPORT,
} from "./fixtures.js";

describe("verdictFromExitCode (exit-code contract, no reinterpretation)", () => {
  it("maps each documented code 1:1", () => {
    expect(verdictFromExitCode(EXIT.CLEAN)).toBe("clean");
    expect(verdictFromExitCode(EXIT.REFUTED)).toBe("refuted");
    expect(verdictFromExitCode(EXIT.UNKNOWN)).toBe("unknown");
    expect(verdictFromExitCode(EXIT.CONFIG_ERROR)).toBe("error");
    expect(verdictFromExitCode(EXIT.PARSE_ERROR)).toBe("error");
  });

  it("treats any unexpected code as an error", () => {
    expect(verdictFromExitCode(7)).toBe("error");
    expect(verdictFromExitCode(-1)).toBe("error");
  });
});

describe("parseJsonReport", () => {
  it("G. parses a clean report", () => {
    const report = parseJsonReport(CLEAN_JSON);
    expect(report?.version).toBe(SUPPORTED_JSON_VERSION);
    expect(report?.summary).toEqual({ refuted: 0, unknown: 0, passed: 3 });
    expect(report?.results).toHaveLength(0);
  });

  it("E. parses a refuted report with counterexample", () => {
    const report = parseJsonReport(REFUTED_JSON);
    expect(report?.summary.refuted).toBe(1);
    const finding = report?.results[0];
    expect(finding?.verdict).toBe("refuted");
    expect(finding?.counterexample?.scenario.skip_tests).toBe("true");
    expect(finding?.counterexample?.execution?.deploy).toBe("run");
  });

  it("F. parses an unknown report", () => {
    const report = parseJsonReport(UNKNOWN_JSON);
    expect(report?.summary.unknown).toBe(1);
    expect(report?.results[0]?.verdict).toBe("unknown");
  });

  it("returns null for absent, empty, or unparsable payloads", () => {
    expect(parseJsonReport(null)).toBeNull();
    expect(parseJsonReport(undefined)).toBeNull();
    expect(parseJsonReport("")).toBeNull();
    expect(parseJsonReport("   ")).toBeNull();
    expect(parseJsonReport("not json")).toBeNull();
    expect(parseJsonReport("[]")).toBeNull();
  });

  it("rejects an unsupported report version", () => {
    const other = JSON.stringify({ version: 2, summary: {}, results: [] });
    expect(parseJsonReport(other)).toBeNull();
  });

  it("coerces malformed summary counts to zero", () => {
    const bad = JSON.stringify({
      version: 1,
      summary: { refuted: "x", unknown: -3, passed: null },
      results: [],
    });
    expect(parseJsonReport(bad)?.summary).toEqual({
      refuted: 0,
      unknown: 0,
      passed: 0,
    });
  });
});

describe("countsFor / actionableFindings", () => {
  it("returns zeros without a report", () => {
    expect(countsFor(null)).toEqual({ refuted: 0, unknown: 0, passed: 0 });
    expect(actionableFindings(null)).toEqual([]);
  });

  it("orders refuted before unknown and drops no-violation", () => {
    const mixed = {
      version: 1,
      summary: { refuted: 1, unknown: 1, passed: 1 },
      results: [
        { ...REFUTED_REPORT.results[0]!, verdict: "unknown" as const },
        { ...REFUTED_REPORT.results[0]!, verdict: "no-violation" as const },
        { ...REFUTED_REPORT.results[0]!, verdict: "refuted" as const },
      ],
    };
    const ordered = actionableFindings(mixed);
    expect(ordered.map((f) => f.verdict)).toEqual(["refuted", "unknown"]);
  });
});
