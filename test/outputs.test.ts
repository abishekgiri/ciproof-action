import { describe, expect, it } from "vitest";
import { computeOutputs, MAX_REPORT_JSON_CHARS } from "../src/outputs.js";
import { countsFor } from "../src/report.js";
import { REFUTED_REPORT, REFUTED_JSON } from "./fixtures.js";

describe("computeOutputs (M. output variables)", () => {
  it("exposes verdict and scalar counts from the report", () => {
    const out = computeOutputs(
      "refuted",
      countsFor(REFUTED_REPORT),
      REFUTED_REPORT,
      REFUTED_JSON,
    );
    expect(out.verdict).toBe("refuted");
    expect(out.refutedCount).toBe(1);
    expect(out.unknownCount).toBe(0);
    expect(out.passedCount).toBe(2);
    expect(out.reportJson).toBe(REFUTED_JSON);
  });

  it("emits zero counts and empty report-json without a report (error)", () => {
    const out = computeOutputs("error", countsFor(null), null, null);
    expect(out.verdict).toBe("error");
    expect(out.refutedCount).toBe(0);
    expect(out.unknownCount).toBe(0);
    expect(out.passedCount).toBe(0);
    expect(out.reportJson).toBe("");
  });

  it("omits report-json when it exceeds the safe size cap", () => {
    const huge = "x".repeat(MAX_REPORT_JSON_CHARS + 1);
    const out = computeOutputs(
      "refuted",
      countsFor(REFUTED_REPORT),
      REFUTED_REPORT,
      huge,
    );
    expect(out.reportJson).toBe("");
  });
});
