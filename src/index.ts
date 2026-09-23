/**
 * Action entry point. Runs the orchestration and converts any unexpected error
 * into a job failure. This is the file bundled to dist/index.js.
 */

import * as core from "@actions/core";
import { run } from "./main.js";

run().catch((err: unknown) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
