import { describe, expect, it } from "vitest";
import {
  InputError,
  parseBool,
  parseInputs,
  type RawInputs,
} from "../src/inputs.js";

function raw(overrides: Partial<RawInputs> = {}): RawInputs {
  return {
    command: "",
    ciproofVersion: "",
    revisions: "",
    failOnRefuted: "",
    failOnUnknown: "",
    comment: "",
    githubToken: "tkn",
    workingDirectory: "",
    ...overrides,
  };
}

describe("parseInputs", () => {
  it("B. defaults to the check command with safe defaults", () => {
    const inputs = parseInputs(raw());
    expect(inputs.command).toBe("check");
    expect(inputs.ciproofVersion).toBe("0.1.0");
    expect(inputs.failOnRefuted).toBe(true);
    expect(inputs.failOnUnknown).toBe(false);
    expect(inputs.comment).toBe(false);
    expect(inputs.workingDirectory).toBe(".");
  });

  it("C. accepts an explicit CIProof version", () => {
    expect(parseInputs(raw({ ciproofVersion: "0.2.1" })).ciproofVersion).toBe(
      "0.2.1",
    );
    expect(parseInputs(raw({ ciproofVersion: "latest" })).ciproofVersion).toBe(
      "latest",
    );
    expect(
      parseInputs(raw({ ciproofVersion: "1.0.0-beta.1" })).ciproofVersion,
    ).toBe("1.0.0-beta.1");
  });

  it("rejects a non-deterministic / arbitrary version spec", () => {
    for (const bad of ["^0.1.0", "0.1", "next", "file:../evil", "0.1.0 && x"]) {
      expect(() => parseInputs(raw({ ciproofVersion: bad }))).toThrow(
        InputError,
      );
    }
  });

  it("D. rejects an unsupported command", () => {
    expect(() => parseInputs(raw({ command: "explain" }))).toThrow(InputError);
    expect(() => parseInputs(raw({ command: "paths" }))).toThrow(InputError);
  });

  it("V. accepts a valid diff revision range and rejects hostile ones", () => {
    expect(
      parseInputs(raw({ command: "diff", revisions: "origin/main...HEAD" }))
        .revisions,
    ).toBe("origin/main...HEAD");
    expect(
      parseInputs(raw({ command: "diff", revisions: "v1.0.0..v1.1.0" }))
        .revisions,
    ).toBe("v1.0.0..v1.1.0");
    for (const bad of ["--output=/etc/x", "; rm -rf /", "$(whoami)", "a b"]) {
      expect(() =>
        parseInputs(raw({ command: "diff", revisions: bad })),
      ).toThrow(InputError);
    }
  });

  it("does not validate revisions when command is check", () => {
    // A default/garbage revisions value is ignored unless diff is selected.
    expect(() =>
      parseInputs(raw({ command: "check", revisions: "-- bad" })),
    ).not.toThrow();
  });
});

describe("parseBool", () => {
  it("parses booleans and falls back on empty", () => {
    expect(parseBool("true", false)).toBe(true);
    expect(parseBool("false", true)).toBe(false);
    expect(parseBool("TRUE", false)).toBe(true);
    expect(parseBool("", true)).toBe(true);
    expect(parseBool("", false)).toBe(false);
  });

  it("throws on a non-boolean", () => {
    expect(() => parseBool("yes", false)).toThrow(InputError);
  });
});
