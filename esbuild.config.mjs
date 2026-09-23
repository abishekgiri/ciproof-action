// Bundles the action's TypeScript entry point and all runtime dependencies into
// a single committed dist/index.js. GitHub JavaScript actions run the bundled
// file directly; consumers never run `npm install`.

import { build } from "esbuild";
import { writeFileSync } from "node:fs";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.js",
  // Keep the output readable so the committed artifact is reviewable in diffs
  // and so `package:check` can compare a fresh build byte-for-byte.
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});

// The repository is an ES module ("type": "module"), but the bundle is
// CommonJS. Mark dist/ as CommonJS so `node dist/index.js` runs it as CJS on the
// runner. This file is committed alongside the bundle.
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }) + "\n");
