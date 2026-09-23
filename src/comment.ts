/**
 * Best-effort PR comment upsert.
 *
 * The action never spams: it finds a previous CIProof comment by a hidden marker
 * AND a bot author, updating it in place instead of adding a new one. It only
 * ever edits its own marker comment, never an arbitrary user comment.
 *
 * Commenting is optional and degrades gracefully: when the workflow token lacks
 * `pull-requests: write` (the normal case for fork pull requests), the API
 * rejects the write and the caller turns that into a notice — it never fails the
 * CIProof analysis.
 */

import { COMMENT_MARKER } from "./render.js";

/** Minimal shape of an issue comment we care about. */
export interface IssueComment {
  id: number;
  body?: string | undefined;
  user?: { login?: string; type?: string } | null;
}

export interface CommentTarget {
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface CommentGate {
  attempt: boolean;
  issueNumber?: number;
  skipReason?: string;
}

/** Decide whether to attempt a comment, given inputs and the event context. */
export function evaluateCommentGate(input: {
  commentEnabled: boolean;
  eventName: string;
  issueNumber: number | undefined;
}): CommentGate {
  if (!input.commentEnabled) {
    return { attempt: false };
  }
  const isPr =
    input.eventName === "pull_request" ||
    input.eventName === "pull_request_target";
  if (!isPr || input.issueNumber === undefined) {
    return {
      attempt: false,
      skipReason:
        "PR comment skipped: this run is not a pull request, so there is no " +
        "pull request to comment on.",
    };
  }
  return { attempt: true, issueNumber: input.issueNumber };
}

/**
 * Find this action's previous comment: one that contains the marker and was
 * written by a bot identity. Returns undefined when there is none.
 */
export function findCiproofComment(
  comments: readonly IssueComment[],
): IssueComment | undefined {
  return comments.find(
    (c) =>
      typeof c.body === "string" &&
      c.body.includes(COMMENT_MARKER) &&
      (c.user?.type === "Bot" || c.user?.login === "github-actions[bot]"),
  );
}

/** Whether an API error is a permission/authorization failure. */
export function isPermissionError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 403 || status === 401 || status === 404;
}

/** Minimal Octokit surface used here (keeps this unit testable). */
export interface CommentApi {
  listComments(target: CommentTarget): Promise<IssueComment[]>;
  updateComment(
    target: CommentTarget,
    commentId: number,
    body: string,
  ): Promise<void>;
  createComment(target: CommentTarget, body: string): Promise<void>;
}

export type UpsertResult =
  { action: "created" } | { action: "updated"; commentId: number };

/** Create or update the CIProof comment. Throws on API failure. */
export async function upsertComment(
  api: CommentApi,
  target: CommentTarget,
  body: string,
): Promise<UpsertResult> {
  const existing = findCiproofComment(await api.listComments(target));
  if (existing) {
    await api.updateComment(target, existing.id, body);
    return { action: "updated", commentId: existing.id };
  }
  await api.createComment(target, body);
  return { action: "created" };
}
