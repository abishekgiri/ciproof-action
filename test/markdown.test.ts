import { describe, expect, it } from "vitest";
import {
  COMMENT_MARKER,
  counterexamplePre,
  escapeHtml,
  renderComment,
  renderSummary,
  type RenderModel,
} from "../src/render.js";
import type { ReportFinding } from "../src/report.js";

/** A finding whose text is hostile: HTML, markdown, and workflow-command bait. */
function hostileFinding(): ReportFinding {
  return {
    id: "evil",
    rule: "invariant",
    ruleId: "ciproof/user/evil",
    verdict: "refuted",
    title: "<img src=x onerror=alert(1)> **pwn**",
    message: "</pre></details><script>alert(1)</script> ::set-output name=x::y",
    workflow: ".github/workflows/x.yml",
    job: "deploy",
    location: null,
    counterexample: {
      scenario: { note: "</pre>`` ```js\nmalicious", event: "push" },
      execution: { deploy: "run" },
    },
    unknownReasons: [],
    fingerprint: "0000000000000000",
  };
}

describe("escapeHtml (U. untrusted output handling)", () => {
  it("escapes all five significant characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("untrusted content cannot inject markup", () => {
  const model: RenderModel = {
    verdict: "refuted",
    counts: { refuted: 1, unknown: 0, passed: 0 },
    findings: [hostileFinding()],
    runUrl: "https://example.test/run/1",
  };

  it("neutralizes HTML in the job summary", () => {
    const md = renderSummary(model);
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<img src=x");
    expect(md).toContain("&lt;script&gt;");
  });

  it("neutralizes HTML and closing tags in the PR comment", () => {
    const md = renderComment(model);
    expect(md).not.toContain("<script>");
    // The counterexample's fake </pre> must be escaped, not literal.
    expect(md).not.toContain("</pre></details><script>");
    expect(md).toContain("&lt;/pre&gt;");
    // Structural tags we emit ourselves are still present and balanced.
    expect(md).toContain("<details>");
    expect(md).toContain("</details>");
    expect(md.trimEnd().endsWith(COMMENT_MARKER)).toBe(true);
  });

  it("counterexamplePre escapes HTML breakout attempts inside <pre>", () => {
    const block = counterexamplePre(hostileFinding().counterexample);
    expect(block.startsWith("<pre>")).toBe(true);
    // A fake </pre> in the data must be escaped, so it cannot close the block.
    expect(block).toContain("&lt;/pre&gt;");
    expect(block).toContain("malicious"); // preserved as escaped text
    // The only literal </pre> is the closing tag we add ourselves (at the end).
    expect(block.match(/<\/pre>/g)).toHaveLength(1);
    expect(block.trimEnd().endsWith("</pre>")).toBe(true);
  });

  it("returns empty for a missing counterexample", () => {
    expect(counterexamplePre(null)).toBe("");
    expect(counterexamplePre(undefined)).toBe("");
  });
});
