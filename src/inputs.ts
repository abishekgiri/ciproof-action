/**
 * Parse and validate the action's inputs into a typed, safe configuration.
 *
 * Validation is strict on purpose: `command` and `ciproof-version` become part
 * of the process invocation, so anything unexpected is rejected rather than
 * passed through. Nothing here executes; it only produces a plain object.
 */

export type Command = "check" | "diff";

export interface ActionInputs {
  command: Command;
  /** npm version spec for the CIProof package: an exact semver or "latest". */
  ciproofVersion: string;
  /** Revision range for `diff` (only meaningful when command === "diff"). */
  revisions: string;
  failOnRefuted: boolean;
  failOnUnknown: boolean;
  comment: boolean;
  githubToken: string;
  /** Directory to analyze (the checked-out workspace). */
  workingDirectory: string;
}

export interface RawInputs {
  command: string;
  ciproofVersion: string;
  revisions: string;
  failOnRefuted: string;
  failOnUnknown: string;
  comment: string;
  githubToken: string;
  workingDirectory: string;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// Conservative revision-range grammar: git ref characters plus range operators.
// Deliberately forbids leading "-" (so it can't be read as a CLI flag), spaces,
// and shell metacharacters. Args are passed without a shell, but this keeps the
// value from being misparsed as an option and rejects obviously hostile input.
const REVISIONS =
  /^[A-Za-z0-9._/][A-Za-z0-9._/-]*(?:\.{2,3}[A-Za-z0-9._/-]+)?$/;

export class InputError extends Error {}

/** Validate raw string inputs into a typed configuration, or throw InputError. */
export function parseInputs(raw: RawInputs): ActionInputs {
  const command = raw.command.trim() || "check";
  if (command !== "check" && command !== "diff") {
    throw new InputError(
      `unsupported command "${command}"; expected "check" or "diff"`,
    );
  }

  const ciproofVersion = raw.ciproofVersion.trim() || "0.1.0";
  if (ciproofVersion !== "latest" && !SEMVER.test(ciproofVersion)) {
    throw new InputError(
      `invalid ciproof-version "${ciproofVersion}"; expected an exact ` +
        `version like 0.1.0, or "latest"`,
    );
  }

  const revisions = raw.revisions.trim() || "origin/main...HEAD";
  if (command === "diff" && !REVISIONS.test(revisions)) {
    throw new InputError(
      `invalid revisions "${revisions}"; expected a range like ` +
        `origin/main...HEAD`,
    );
  }

  return {
    command,
    ciproofVersion,
    revisions,
    failOnRefuted: parseBool(raw.failOnRefuted, true),
    failOnUnknown: parseBool(raw.failOnUnknown, false),
    comment: parseBool(raw.comment, false),
    githubToken: raw.githubToken,
    workingDirectory: raw.workingDirectory.trim() || ".",
  };
}

/** Parse a GitHub-style boolean input; empty falls back to `fallback`. */
export function parseBool(value: string, fallback: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (v === "") {
    return fallback;
  }
  if (v === "true") {
    return true;
  }
  if (v === "false") {
    return false;
  }
  throw new InputError(`expected a boolean ("true"/"false"), got "${value}"`);
}
