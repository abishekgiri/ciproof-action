import { describe, expect, it, vi } from "vitest";
import { isAbsolute } from "node:path";

const h = vi.hoisted(() => ({
  exec: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

vi.mock("@actions/exec", () => ({
  getExecOutput: h.exec,
}));

import { runCheck, runDiff } from "../src/ciproof.js";

function lastArgs(): string[] {
  const call = h.exec.mock.calls.at(-1) as unknown as [string, string[]];
  return call[1];
}

describe("runCheck/runDiff resolve the workspace to an absolute path", () => {
  it("passes an absolute -C even for a relative working-directory (regression)", async () => {
    h.exec.mockClear();
    await runCheck({ version: "0.1.0", workspace: "test/fixtures/refuted" });
    const args = lastArgs();
    const dir = args[args.indexOf("-C") + 1] ?? "";
    // The scratch cwd differs from the workspace, so a relative path would break.
    expect(isAbsolute(dir)).toBe(true);
    expect(dir.endsWith("test/fixtures/refuted")).toBe(true);
  });

  it("does the same for diff", async () => {
    h.exec.mockClear();
    await runDiff({
      version: "0.1.0",
      workspace: ".",
      revisions: "origin/main...HEAD",
    });
    const args = lastArgs();
    const dir = args[args.indexOf("-C") + 1] ?? "";
    expect(isAbsolute(dir)).toBe(true);
  });
});
