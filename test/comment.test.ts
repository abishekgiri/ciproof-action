import { describe, expect, it, vi } from "vitest";
import {
  evaluateCommentGate,
  findCiproofComment,
  isPermissionError,
  upsertComment,
  type CommentApi,
  type CommentTarget,
  type IssueComment,
} from "../src/comment.js";
import {
  COMMENT_MARKER,
  renderComment,
  type RenderModel,
} from "../src/render.js";
import { actionableFindings, countsFor } from "../src/report.js";
import { REFUTED_REPORT, UNKNOWN_REPORT } from "./fixtures.js";

const TARGET: CommentTarget = { owner: "o", repo: "r", issueNumber: 7 };

describe("renderComment (P. PR comment rendering)", () => {
  it("renders a compact refuted comment with a details block and marker", () => {
    const model: RenderModel = {
      verdict: "refuted",
      counts: countsFor(REFUTED_REPORT),
      findings: actionableFindings(REFUTED_REPORT),
      runUrl: "https://example.test/run/9",
    };
    const md = renderComment(model);
    expect(md).toContain("## CIProof");
    expect(md).toContain("❌ 1 invariant refuted");
    expect(md).toContain("<summary>Counterexample</summary>");
    expect(md).toContain("[View workflow run](https://example.test/run/9)");
    expect(md).toContain(COMMENT_MARKER);
  });

  it("explains UNKNOWN and marks a clean run", () => {
    const unknown = renderComment({
      verdict: "unknown",
      counts: countsFor(UNKNOWN_REPORT),
      findings: actionableFindings(UNKNOWN_REPORT),
    });
    expect(unknown).toContain("⚠️");
    expect(unknown).toContain("could not soundly model");

    const clean = renderComment({
      verdict: "clean",
      counts: { refuted: 0, unknown: 0, passed: 3 },
      findings: [],
    });
    expect(clean).toContain("No violation found in the modeled scenarios.");
    expect(clean).toContain(COMMENT_MARKER);
  });
});

describe("evaluateCommentGate (R/S. gating)", () => {
  it("does not attempt when commenting is disabled (no noise)", () => {
    const gate = evaluateCommentGate({
      commentEnabled: false,
      eventName: "pull_request",
      issueNumber: 7,
    });
    expect(gate.attempt).toBe(false);
    expect(gate.skipReason).toBeUndefined();
  });

  it("skips with a reason when enabled but not a pull request", () => {
    const gate = evaluateCommentGate({
      commentEnabled: true,
      eventName: "push",
      issueNumber: undefined,
    });
    expect(gate.attempt).toBe(false);
    expect(gate.skipReason).toMatch(/not a pull request/i);
  });

  it("attempts on a pull request with an issue number", () => {
    const gate = evaluateCommentGate({
      commentEnabled: true,
      eventName: "pull_request",
      issueNumber: 7,
    });
    expect(gate.attempt).toBe(true);
    expect(gate.issueNumber).toBe(7);
  });
});

describe("findCiproofComment (Q. dedup selection)", () => {
  it("finds only a bot comment carrying the marker", () => {
    const comments: IssueComment[] = [
      { id: 1, body: "human note", user: { login: "alice", type: "User" } },
      {
        id: 2,
        body: `hi ${COMMENT_MARKER}`,
        user: { login: "mallory", type: "User" },
      },
      {
        id: 3,
        body: `## CIProof\n${COMMENT_MARKER}`,
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ];
    expect(findCiproofComment(comments)?.id).toBe(3);
  });

  it("returns undefined when there is no prior bot marker comment", () => {
    expect(
      findCiproofComment([{ id: 1, body: "x", user: null }]),
    ).toBeUndefined();
  });
});

describe("upsertComment (Q. update rather than duplicate)", () => {
  function api(existing: IssueComment[]): CommentApi & {
    created: string[];
    updated: Array<{ id: number; body: string }>;
  } {
    const created: string[] = [];
    const updated: Array<{ id: number; body: string }> = [];
    return {
      created,
      updated,
      listComments: vi.fn(async () => existing),
      createComment: vi.fn(async (_t, body) => {
        created.push(body);
      }),
      updateComment: vi.fn(async (_t, id, body) => {
        updated.push({ id, body });
      }),
    };
  }

  it("updates the existing CIProof comment in place", async () => {
    const a = api([
      {
        id: 42,
        body: `old ${COMMENT_MARKER}`,
        user: { login: "github-actions[bot]", type: "Bot" },
      },
    ]);
    const res = await upsertComment(a, TARGET, "new body");
    expect(res).toEqual({ action: "updated", commentId: 42 });
    expect(a.updated).toEqual([{ id: 42, body: "new body" }]);
    expect(a.created).toHaveLength(0);
  });

  it("creates a comment when none exists", async () => {
    const a = api([]);
    const res = await upsertComment(a, TARGET, "first");
    expect(res).toEqual({ action: "created" });
    expect(a.created).toEqual(["first"]);
    expect(a.updated).toHaveLength(0);
  });
});

describe("isPermissionError (S. fork PR safe behavior)", () => {
  it("recognizes read-only-token rejections", () => {
    expect(isPermissionError({ status: 403 })).toBe(true);
    expect(isPermissionError({ status: 401 })).toBe(true);
    expect(isPermissionError({ status: 404 })).toBe(true);
  });

  it("does not treat other errors as permission failures", () => {
    expect(isPermissionError({ status: 500 })).toBe(false);
    expect(isPermissionError(new Error("network"))).toBe(false);
    expect(isPermissionError(null)).toBe(false);
  });
});
