/**
 * Pure failure policy. Decides whether the action should fail the job for a
 * given verdict, preserving CIProof's strong signal: a concrete violation fails
 * CI by default; UNKNOWN is visible but does not fail unless configured; and any
 * configuration/CLI/model error always fails.
 */

import type { Verdict } from "./report.js";

export interface FailPolicy {
  failOnRefuted: boolean;
  failOnUnknown: boolean;
}

export interface FailDecision {
  fail: boolean;
  reason?: string;
}

export function decideFailure(
  verdict: Verdict,
  policy: FailPolicy,
): FailDecision {
  switch (verdict) {
    case "error":
      return {
        fail: true,
        reason:
          "CIProof could not complete the analysis (configuration, CLI, or " +
          "model error).",
      };
    case "refuted":
      return policy.failOnRefuted
        ? {
            fail: true,
            reason:
              "CIProof refuted an invariant: a concrete counterexample exists.",
          }
        : { fail: false };
    case "unknown":
      return policy.failOnUnknown
        ? {
            fail: true,
            reason:
              "CIProof analysis was incomplete (UNKNOWN) and fail-on-unknown " +
              "is enabled. UNKNOWN is not a pass.",
          }
        : { fail: false };
    case "clean":
      return { fail: false };
  }
}
