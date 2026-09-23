import { describe, expect, it } from "vitest";
import { decideFailure } from "../src/decision.js";

describe("decideFailure (failure policy)", () => {
  it("I. fails on refuted when fail-on-refuted=true (default)", () => {
    const d = decideFailure("refuted", {
      failOnRefuted: true,
      failOnUnknown: false,
    });
    expect(d.fail).toBe(true);
    expect(d.reason).toMatch(/refuted/i);
  });

  it("J. does not fail on refuted when fail-on-refuted=false", () => {
    expect(
      decideFailure("refuted", { failOnRefuted: false, failOnUnknown: false })
        .fail,
    ).toBe(false);
  });

  it("K. fails on unknown when fail-on-unknown=true", () => {
    const d = decideFailure("unknown", {
      failOnRefuted: true,
      failOnUnknown: true,
    });
    expect(d.fail).toBe(true);
    expect(d.reason).toMatch(/unknown/i);
  });

  it("L. does not fail on unknown when fail-on-unknown=false (default)", () => {
    expect(
      decideFailure("unknown", { failOnRefuted: true, failOnUnknown: false })
        .fail,
    ).toBe(false);
  });

  it("always fails on an error, regardless of policy", () => {
    for (const policy of [
      { failOnRefuted: false, failOnUnknown: false },
      { failOnRefuted: true, failOnUnknown: true },
    ]) {
      expect(decideFailure("error", policy).fail).toBe(true);
    }
  });

  it("never fails on a clean verdict", () => {
    expect(
      decideFailure("clean", { failOnRefuted: true, failOnUnknown: true }).fail,
    ).toBe(false);
  });
});
