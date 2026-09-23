import { describe, expect, it } from "vitest";
import { planAnnotations } from "../src/annotations.js";
import { actionableFindings } from "../src/report.js";
import { REFUTED_REPORT, UNKNOWN_REPORT } from "./fixtures.js";
import type { ReportFinding } from "../src/report.js";

describe("planAnnotations (O. annotation rendering)", () => {
  it("maps REFUTED to an error annotation with its source location", () => {
    const [a, ...rest] = planAnnotations(actionableFindings(REFUTED_REPORT));
    expect(rest).toHaveLength(0);
    expect(a?.level).toBe("error");
    expect(a?.file).toBe(".github/workflows/deploy.yml");
    expect(a?.startLine).toBe(12);
    expect(a?.startColumn).toBe(3);
    expect(a?.title).toContain("CIProof");
  });

  it("maps UNKNOWN to a warning annotation", () => {
    const plans = planAnnotations(actionableFindings(UNKNOWN_REPORT));
    expect(plans[0]?.level).toBe("warning");
    expect(plans[0]?.startLine).toBe(30);
    expect(plans[0]?.startColumn).toBeUndefined();
  });

  it("never fabricates a location when CIProof provides none", () => {
    const finding: ReportFinding = {
      ...REFUTED_REPORT.results[0]!,
      location: null,
    };
    const [a] = planAnnotations([finding]);
    expect(a?.file).toBeUndefined();
    expect(a?.startLine).toBeUndefined();
    expect(a?.startColumn).toBeUndefined();
    // The message still carries the workflow/job scope for context.
    expect(a?.message).toContain("deploy");
  });

  it("emits nothing for a no-violation finding", () => {
    const finding: ReportFinding = {
      ...REFUTED_REPORT.results[0]!,
      verdict: "no-violation",
    };
    expect(planAnnotations([finding])).toHaveLength(0);
  });
});
