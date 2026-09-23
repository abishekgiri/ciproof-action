/** Sample CIProof JSON v1 reports used across the action's tests. */

import type { JsonReport } from "../src/report.js";

export const REFUTED_REPORT: JsonReport = {
  version: 1,
  summary: { refuted: 1, unknown: 0, passed: 2 },
  results: [
    {
      id: "production-needs-tests",
      rule: "invariant",
      ruleId: "ciproof/user/production-needs-tests",
      verdict: "refuted",
      title: "production-needs-tests",
      message:
        "deploy can run without tests having completed in a modeled scenario.",
      workflow: ".github/workflows/deploy.yml",
      job: "deploy",
      location: { file: ".github/workflows/deploy.yml", line: 12, column: 3 },
      counterexample: {
        scenario: {
          event: "workflow_dispatch",
          branch: "main",
          skip_tests: "true",
        },
        execution: { tests: "skipped", deploy: "run" },
      },
      unknownReasons: [],
      fingerprint: "abc123def4567890",
    },
  ],
};

export const UNKNOWN_REPORT: JsonReport = {
  version: 1,
  summary: { refuted: 0, unknown: 1, passed: 1 },
  results: [
    {
      id: "release-needs-security",
      rule: "invariant",
      ruleId: "ciproof/user/release-needs-security",
      verdict: "unknown",
      title: "release-needs-security",
      message:
        "release reachability depends on a runtime-produced value CIProof " +
        "cannot model.",
      workflow: ".github/workflows/release.yml",
      job: "release",
      location: { file: ".github/workflows/release.yml", line: 30 },
      counterexample: null,
      unknownReasons: [
        "needs.generate.outputs.should_deploy is runtime-produced",
      ],
      fingerprint: "def4560000000000",
    },
  ],
};

export const CLEAN_REPORT: JsonReport = {
  version: 1,
  summary: { refuted: 0, unknown: 0, passed: 3 },
  results: [],
};

export const REFUTED_JSON = JSON.stringify(REFUTED_REPORT, null, 2) + "\n";
export const UNKNOWN_JSON = JSON.stringify(UNKNOWN_REPORT, null, 2) + "\n";
export const CLEAN_JSON = JSON.stringify(CLEAN_REPORT, null, 2) + "\n";
