import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLEAN_JSON, REFUTED_JSON } from "./fixtures.js";

// Shared, mutable test doubles. Declared via vi.hoisted so the vi.mock factories
// (which are hoisted above imports) can reference them safely.
const h = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  outputs: {} as Record<string, string>,
  failed: [] as string[],
  notices: [] as string[],
  warnings: [] as string[],
  errors: [] as Array<{ msg: string; props?: unknown }>,
  secrets: [] as string[],
  summary: { text: "" },
  gh: {
    eventName: "push",
    payload: {} as Record<string, unknown>,
    repo: { owner: "o", repo: "r" },
  },
  octokit: {
    paginate: vi.fn(async () => [] as unknown[]),
    rest: {
      issues: {
        createComment: vi.fn(async () => {}),
        updateComment: vi.fn(async () => {}),
        listComments: vi.fn(),
      },
    },
  },
  ciproof: { runCheck: vi.fn(), runDiff: vi.fn() },
}));

vi.mock("@actions/core", () => ({
  getInput: (n: string) => h.inputs[n] ?? "",
  setOutput: (n: string, v: string) => {
    h.outputs[n] = v;
  },
  setFailed: (m: string) => {
    h.failed.push(m);
  },
  setSecret: (s: string) => {
    h.secrets.push(s);
  },
  info: () => {},
  notice: (m: string) => {
    h.notices.push(m);
  },
  warning: (m: string) => {
    h.warnings.push(m);
  },
  error: (m: string, props?: unknown) => {
    h.errors.push({ msg: m, props });
  },
  summary: {
    addRaw(s: string) {
      h.summary.text += s;
      return this;
    },
    async write() {
      return this;
    },
  },
}));

vi.mock("@actions/github", () => ({
  context: h.gh,
  getOctokit: () => h.octokit,
}));

vi.mock("../src/ciproof.js", () => ({
  runCheck: h.ciproof.runCheck,
  runDiff: h.ciproof.runDiff,
}));

import { run } from "../src/main.js";

const TOKEN = "gho_secret_test_token_value";

beforeEach(() => {
  h.inputs = { "github-token": TOKEN };
  h.outputs = {};
  h.failed = [];
  h.notices = [];
  h.warnings = [];
  h.errors = [];
  h.secrets = [];
  h.summary.text = "";
  h.gh.eventName = "push";
  h.gh.payload = {};
  h.gh.repo = { owner: "o", repo: "r" };
  h.octokit.paginate.mockReset().mockResolvedValue([]);
  h.octokit.rest.issues.createComment.mockReset().mockResolvedValue(undefined);
  h.octokit.rest.issues.updateComment.mockReset().mockResolvedValue(undefined);
  h.ciproof.runCheck.mockReset();
  h.ciproof.runDiff.mockReset();
});

describe("run — check flow (integration of pure modules)", () => {
  it("clean run: masks token, sets outputs, writes summary, does not fail", async () => {
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      reportJson: CLEAN_JSON,
    });

    await run();

    expect(h.secrets).toContain(TOKEN); // T. token masked
    expect(h.outputs.verdict).toBe("clean");
    expect(h.outputs["refuted-count"]).toBe("0");
    expect(h.outputs["passed-count"]).toBe("3");
    expect(h.failed).toHaveLength(0);
    expect(h.summary.text).toContain(
      "No violation found in the modeled scenarios.",
    );
  });

  it("T. never leaks the token into any output value", async () => {
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      reportJson: CLEAN_JSON,
    });
    await run();
    for (const value of Object.values(h.outputs)) {
      expect(value).not.toContain(TOKEN);
    }
    expect(h.summary.text).not.toContain(TOKEN);
  });

  it("I. refuted run fails the job and emits an error annotation", async () => {
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
      reportJson: REFUTED_JSON,
    });

    await run();

    expect(h.outputs.verdict).toBe("refuted");
    expect(h.outputs["refuted-count"]).toBe("1");
    expect(h.failed).toHaveLength(1);
    expect(h.errors.length).toBeGreaterThanOrEqual(1);
    expect(h.errors[0]?.msg).toContain("deploy");
  });

  it("J. refuted run does not fail when fail-on-refuted=false", async () => {
    h.inputs["fail-on-refuted"] = "false";
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
      reportJson: REFUTED_JSON,
    });

    await run();

    expect(h.outputs.verdict).toBe("refuted");
    expect(h.failed).toHaveLength(0);
  });

  it("H. always fails on a CLI/config error (exit 2), even without JSON", async () => {
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 2,
      stdout: "",
      stderr: "Configuration error: ciproof.yml: bad",
      reportJson: null,
    });

    await run();

    expect(h.outputs.verdict).toBe("error");
    expect(h.failed).toHaveLength(1);
    expect(h.summary.text).toContain("could not complete the analysis");
  });

  it("D. rejects an unsupported command before running anything", async () => {
    h.inputs.command = "explain";
    await run();
    expect(h.failed[0]).toMatch(/unsupported command/i);
    expect(h.ciproof.runCheck).not.toHaveBeenCalled();
  });
});

describe("run — PR comment behavior", () => {
  function cleanCheck(): void {
    h.ciproof.runCheck.mockResolvedValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
      reportJson: CLEAN_JSON,
    });
  }

  it("posts a new comment on a pull request when enabled", async () => {
    h.inputs.comment = "true";
    h.gh.eventName = "pull_request";
    h.gh.payload = { pull_request: { number: 5 } };
    cleanCheck();

    await run();

    expect(h.octokit.rest.issues.createComment).toHaveBeenCalledTimes(1);
    const calls = h.octokit.rest.issues.createComment.mock
      .calls as unknown as Array<[{ issue_number: number; body: string }]>;
    const arg = calls[0]?.[0];
    expect(arg?.issue_number).toBe(5);
    expect(arg?.body).toContain("CIProof");
  });

  it("skips commenting with a notice on a non-PR event", async () => {
    h.inputs.comment = "true";
    h.gh.eventName = "push";
    cleanCheck();

    await run();

    expect(h.octokit.rest.issues.createComment).not.toHaveBeenCalled();
    expect(h.notices.some((n) => /not a pull request/i.test(n))).toBe(true);
  });

  it("S. fork PR: a read-only token 403 is a notice, not a failure", async () => {
    h.inputs.comment = "true";
    h.gh.eventName = "pull_request";
    h.gh.payload = { pull_request: { number: 8 } };
    cleanCheck();
    h.octokit.rest.issues.createComment.mockRejectedValue({ status: 403 });

    await run();

    expect(h.failed).toHaveLength(0); // analysis result stands
    expect(h.outputs.verdict).toBe("clean");
    expect(
      h.notices.some((n) => /pull-request write permission/i.test(n)),
    ).toBe(true);
  });
});
