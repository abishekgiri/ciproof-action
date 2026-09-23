import { describe, expect, it } from "vitest";
import { renderSummary, type RenderModel } from "../src/render.js";
import { actionableFindings, countsFor } from "../src/report.js";
import { REFUTED_REPORT, UNKNOWN_REPORT, CLEAN_REPORT } from "./fixtures.js";

describe("renderSummary (N. job summary rendering)", () => {
  it("renders a REFUTED summary with status, counts, and counterexample", () => {
    const model: RenderModel = {
      verdict: "refuted",
      counts: countsFor(REFUTED_REPORT),
      findings: actionableFindings(REFUTED_REPORT),
    };
    const md = renderSummary(model);
    expect(md).toContain("# CIProof");
    expect(md).toContain("Status: REFUTED");
    expect(md).toContain("1 invariant refuted");
    expect(md).toContain("production-needs-tests");
    expect(md).toContain("skip_tests: true");
    expect(md).toContain("deploy: RUN");
    expect(md).toContain("No workflow was executed.");
    expect(md).toContain("No secrets were required.");
  });

  it("renders a clean summary that never says safe", () => {
    const md = renderSummary({
      verdict: "clean",
      counts: countsFor(CLEAN_REPORT),
      findings: [],
    });
    expect(md).toContain("No violation found in the modeled scenarios.");
    expect(md.toLowerCase()).not.toContain("safe");
  });

  it("renders an UNKNOWN summary that states UNKNOWN is not a pass", () => {
    const md = renderSummary({
      verdict: "unknown",
      counts: countsFor(UNKNOWN_REPORT),
      findings: actionableFindings(UNKNOWN_REPORT),
    });
    expect(md).toContain("Analysis incomplete");
    expect(md).toContain("UNKNOWN is not a pass.");
    expect(md).toContain("release-needs-security");
  });

  it("renders an error summary with the CLI output", () => {
    const md = renderSummary({
      verdict: "error",
      counts: { refuted: 0, unknown: 0, passed: 0 },
      findings: [],
      errorOutput: "Configuration error: ciproof.yml: bad",
    });
    expect(md).toContain("could not complete the analysis");
    expect(md).toContain("Configuration error");
  });

  it("renders a diff summary inside a preformatted block", () => {
    const md = renderSummary({
      verdict: "clean",
      counts: { refuted: 0, unknown: 0, passed: 0 },
      findings: [],
      diffText: "deploy-production\n+ reachable from workflow_dispatch",
    });
    expect(md).toContain("behavior diff");
    expect(md).toContain("deploy-production");
  });
});
