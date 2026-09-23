import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface ActionInput {
  description?: string;
  required?: boolean;
  default?: unknown;
}
interface ActionMeta {
  name?: string;
  description?: string;
  author?: string;
  branding?: { icon?: string; color?: string };
  inputs?: Record<string, ActionInput>;
  outputs?: Record<string, { description?: string }>;
  runs?: { using?: string; main?: string };
}

const meta = parseYaml(
  readFileSync(join(root, "action.yml"), "utf8"),
) as ActionMeta;

describe("action.yml (A. metadata)", () => {
  it("declares professional Marketplace metadata", () => {
    expect(meta.name).toBe("CIProof");
    expect(meta.description).toMatch(/behavioral verification/i);
    expect(meta.author).toBeTruthy();
    expect(meta.branding?.icon).toBeTruthy();
    expect(meta.branding?.color).toBeTruthy();
  });

  it("runs the committed bundle on a JavaScript runtime", () => {
    expect(meta.runs?.using).toBe("node24");
    expect(meta.runs?.main).toBe("dist/index.js");
  });

  it("declares the documented inputs with safe defaults", () => {
    const inputs = meta.inputs ?? {};
    expect(inputs.command?.default).toBe("check");
    expect(inputs["ciproof-version"]?.default).toBe("0.1.0"); // deterministic
    expect(inputs["fail-on-refuted"]?.default).toBe("true");
    expect(inputs["fail-on-unknown"]?.default).toBe("false");
    expect(inputs.comment?.default).toBe("false");
    expect(inputs["github-token"]?.default).toBe("${{ github.token }}");
    expect(inputs.revisions?.default).toBe("origin/main...HEAD");
  });

  it("declares the stable outputs", () => {
    const outputs = meta.outputs ?? {};
    for (const key of [
      "verdict",
      "refuted-count",
      "unknown-count",
      "passed-count",
      "report-json",
    ]) {
      expect(outputs[key]?.description, key).toBeTruthy();
    }
  });

  it("does not require a personal access token", () => {
    // The only token input defaults to the workflow token.
    expect(meta.inputs?.["github-token"]?.required).not.toBe(true);
  });
});

describe("dist bundle is present", () => {
  it("ships dist/index.js", () => {
    const bundle = readFileSync(join(root, "dist", "index.js"), "utf8");
    expect(bundle.length).toBeGreaterThan(1000);
  });
});
