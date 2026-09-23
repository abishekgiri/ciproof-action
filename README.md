# CIProof Action

Run [CIProof](https://github.com/abishekgiri/ciproof) — behavioral verification
for GitHub Actions — directly in your workflows. CIProof explores the meaningful
execution paths of your workflows and shows a concrete counterexample when an
invariant can be broken.

- **No workflow is executed.** CIProof only reads workflow and config files as
  data.
- **No secrets are required.**
- **`UNKNOWN` is not a pass.** When CIProof cannot soundly model something, it
  says so instead of claiming safety.

This action is a thin wrapper around the published `ciproof` npm package. The CLI
is the single source of truth for all analysis; the action only runs it, renders
a job summary, emits annotations, exposes outputs, and (optionally) comments on
the pull request.

## What it does

- Runs `ciproof check` (or `ciproof diff`) against your checked-out repository.
- Writes a Markdown **job summary** with the verdict and any counterexample.
- Emits **annotations** (error for refuted, warning for unknown) at the source
  location when CIProof provides one.
- Exposes structured **outputs** (`verdict`, counts, and the JSON report).
- Optionally posts and updates a single **pull request comment**.

## Quickstart

```yaml
name: CIProof

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ciproof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: abishekgiri/ciproof-action@v1
        with:
          command: check
```

A refuted invariant fails the job by default; a concrete counterexample appears
in the job summary and as an error annotation.

## Pull request usage (comments)

To also post a summary comment on the pull request, grant `pull-requests: write`
and set `comment: true`:

```yaml
permissions:
  contents: read
  pull-requests: write

jobs:
  ciproof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: abishekgiri/ciproof-action@v1
        with:
          command: check
          comment: true
```

The action keeps a single comment per pull request: it finds its previous
comment by a hidden marker and updates it in place instead of posting a new one
each run.

## Permissions

| Feature                | Required permissions                        |
| ---------------------- | ------------------------------------------- |
| Analysis + job summary | `contents: read`                            |
| Pull request comment   | `contents: read` and `pull-requests: write` |

The default `github-token` (`${{ github.token }}`) is sufficient. **You do not
need a personal access token.**

## Fork behavior

For pull requests from forks, GitHub gives the workflow a **read-only** token, so
the action cannot post a comment. This is expected and safe:

- The analysis still runs and the **job summary still works**.
- The comment is **skipped with a notice**; the job does not fail because
  commenting failed.

This action uses the ordinary `pull_request` event on purpose. It does **not**
recommend `pull_request_target`, which — when it checks out and runs untrusted
PR code with elevated privileges — is a well-documented "pwn request" security
risk. CIProof never checks out or executes pull request code; it only reads
files.

## Inputs

| Input               | Default               | Description                                                                                                   |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `command`           | `check`               | `check` or `diff`.                                                                                            |
| `ciproof-version`   | `0.1.0`               | Version of the `ciproof` npm package to run. An exact version is recommended; `latest` is also accepted.      |
| `revisions`         | `origin/main...HEAD`  | Git revision range for `command: diff`. The base revision must be present in the checkout (`fetch-depth: 0`). |
| `fail-on-refuted`   | `true`                | Fail the job when CIProof refutes an invariant.                                                               |
| `fail-on-unknown`   | `false`               | Fail the job when CIProof reports `UNKNOWN`. Visible either way; `UNKNOWN` is not a pass.                     |
| `comment`           | `false`               | Post/update a summary comment on the pull request. Requires `pull-requests: write`. Best-effort on forks.     |
| `github-token`      | `${{ github.token }}` | Token used to post PR comments. A personal access token is not required.                                      |
| `working-directory` | `.`                   | Directory to analyze.                                                                                         |

### Failing behavior

- **Refuted** (a concrete counterexample exists): fails when `fail-on-refuted` is
  `true` (the default).
- **Unknown** (analysis incomplete): fails only when `fail-on-unknown` is `true`.
  It is always shown in the summary and as a warning annotation.
- **Configuration / CLI / model errors**: always fail.

## Outputs

| Output          | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| `verdict`       | One of `refuted`, `unknown`, `clean`, `error`.                  |
| `refuted-count` | Number of refuted invariants.                                   |
| `unknown-count` | Number of `UNKNOWN` findings.                                   |
| `passed-count`  | Number of invariants that passed within the modeled scenarios.  |
| `report-json`   | The CIProof JSON v1 report, when small enough to expose safely. |

## Example — REFUTED

```
# CIProof

Status: REFUTED

1 invariant refuted
0 unknown
2 passed

## production-needs-tests

deploy can run without tests having completed in a modeled scenario.

Counterexample:

event: workflow_dispatch
branch: main
skip_tests: true

tests: SKIPPED
deploy: RUN

No workflow was executed.
No secrets were required.
```

## Example — UNKNOWN

```
# CIProof

? Analysis incomplete

CIProof could not soundly determine all relevant behavior.

UNKNOWN is not a pass.
```

`UNKNOWN` means CIProof could not soundly model some relevant behavior (for
example, a value produced by runtime code). It is not a clean result.

## Semantic diff on pull requests

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0

- uses: abishekgiri/ciproof-action@v1
  with:
    command: diff
    revisions: origin/${{ github.base_ref }}...HEAD
```

`command: diff` reports how CI **behavior** changes (paths gained/lost,
prerequisites, privilege), not a textual YAML diff. It needs the base revision
in the checkout, so use `fetch-depth: 0`. If the base revision is missing, the
action reports a clear error. It never modifies your git history.

## Versioning

The action and the CIProof CLI are versioned **independently**:

- `abishekgiri/ciproof-action@v1` — the action (this repository).
- `ciproof-version: 0.1.0` — the analyzer package it runs.

Use the `v1` major tag to get non-breaking action updates, or pin a full commit
SHA for immutability:

```yaml
- uses: abishekgiri/ciproof-action@v1
# or
- uses: abishekgiri/ciproof-action@<full-sha>
```

Pin `ciproof-version` to an exact version for reproducible analysis.

## Security model

- CIProof **does not execute** workflows, repository scripts, local actions, or
  containers. It reads workflow/config files as data.
- The action runs the published `ciproof` package by an explicit version from a
  throwaway directory, so it never runs your repository's `package.json` scripts
  or installs your repository.
- Arguments are passed as an argv array (no shell), and repository content is
  HTML-escaped before it appears in the summary or a comment, so it cannot inject
  markup or workflow commands.
- No secrets are required. The token is only used to post PR comments, is masked,
  and is never logged.
- Default permission is `contents: read`; `pull-requests: write` is requested
  only when you enable comments, and the action degrades gracefully without it.

## Links

- CIProof CLI: https://github.com/abishekgiri/ciproof
- CIProof on npm: https://www.npmjs.com/package/ciproof

## License

MIT — see [LICENSE](LICENSE).
