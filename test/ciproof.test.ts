import { describe, expect, it } from "vitest";
import { buildCheckArgs, buildDiffArgs, npmCommand } from "../src/ciproof.js";

describe("CIProof invocation (argv builders)", () => {
  it("B. builds a check invocation that runs the exact published version", () => {
    const args = buildCheckArgs("0.1.0", "/work", "/tmp/r.json");
    expect(args).toEqual([
      "exec",
      "--yes",
      "ciproof@0.1.0",
      "--",
      "check",
      "-C",
      "/work",
      "--format",
      "json",
      "--output",
      "/tmp/r.json",
    ]);
  });

  it("uses JSON v1 output, never scraping human text", () => {
    const args = buildCheckArgs("0.1.0", "/work", "/tmp/r.json");
    expect(args).toContain("--format");
    expect(args[args.indexOf("--format") + 1]).toBe("json");
  });

  it("passes the version through for latest", () => {
    expect(
      buildCheckArgs("latest", "/w", "/o").includes("ciproof@latest"),
    ).toBe(true);
  });

  it("V. builds a diff invocation with the revision range as a positional", () => {
    const args = buildDiffArgs("0.1.0", "/work", "origin/main...HEAD");
    expect(args).toEqual([
      "exec",
      "--yes",
      "ciproof@0.1.0",
      "--",
      "diff",
      "origin/main...HEAD",
      "-C",
      "/work",
    ]);
    // `--` separates npm's args from ciproof's, so the range is never read as an
    // npm flag.
    expect(args.indexOf("--")).toBeLessThan(args.indexOf("diff"));
  });

  it("resolves the platform npm executable", () => {
    const expected = process.platform === "win32" ? "npm.cmd" : "npm";
    expect(npmCommand()).toBe(expected);
  });
});
