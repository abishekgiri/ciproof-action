// Verifies that the committed dist/index.js matches a fresh build of src/.
// GitHub JavaScript actions ship their bundled code; CI runs this so the
// committed bundle can never drift from source.

import { build } from "esbuild";
import { readFileSync } from "node:fs";

const committedPath = "dist/index.js";

let committed;
try {
  committed = readFileSync(committedPath, "utf8");
} catch {
  console.error(
    `error: ${committedPath} is missing. Run "npm run build" and commit it.`,
  );
  process.exit(1);
}

// The CommonJS marker must be committed so `node dist/index.js` runs as CJS.
let distPkgType;
try {
  distPkgType = JSON.parse(readFileSync("dist/package.json", "utf8")).type;
} catch {
  distPkgType = undefined;
}
if (distPkgType !== "commonjs") {
  console.error(
    'error: dist/package.json must exist with {"type":"commonjs"}. ' +
      'Run "npm run build" and commit it.',
  );
  process.exit(1);
}

const result = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  write: false,
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "silent",
});

const fresh = result.outputFiles[0].text;

if (fresh !== committed) {
  console.error(
    "error: dist/index.js is out of date with src/.\n" +
      'Run "npm run build" and commit the result.',
  );
  process.exit(1);
}

console.log("dist/index.js is up to date with src/.");
