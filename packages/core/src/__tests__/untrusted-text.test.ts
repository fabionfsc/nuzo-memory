import { describe, expect, it } from "vitest";
import {
  renderUntrustedInlineText,
  renderUntrustedMarkdownBlock,
  stringifyUntrustedJson,
} from "../index.js";

describe("untrusted text rendering", () => {
  const controls = "nul\0 tab\t line\n return\r esc\u001b bel\u0007 del\u007f c1\u009b ls\u2028 ps\u2029 bidi\u202e isolate\u2066";

  it("renders control characters visibly on one terminal line", () => {
    const rendered = renderUntrustedInlineText(`${controls} literal\\n`);

    expect(rendered).toBe(
      "nul\\u0000 tab\\t line\\n return\\r esc\\u001b bel\\u0007 del\\u007f c1\\u009b ls\\u2028 ps\\u2029 bidi\\u202e isolate\\u2066 literal\\\\n",
    );
    expect(rendered).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u);
  });

  it("keeps JSON semantics while escaping terminal and bidi controls JSON leaves raw", () => {
    const value = { content: controls };
    const rendered = stringifyUntrustedJson(value);

    expect(JSON.parse(rendered)).toEqual(value);
    expect(rendered).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u);
  });

  it("contains Markdown structure and a competing code fence", () => {
    const content = "# forged heading\n<script>alert(1)</script>\n```\n- forged item\t\u001b[31m";
    const rendered = renderUntrustedMarkdownBlock(content);

    expect(rendered).toMatch(/^````text\n/u);
    expect(rendered).toContain("# forged heading\n<script>alert(1)</script>\n```");
    expect(rendered).toContain("- forged item\\t\\u001b[31m");
    expect(rendered).toMatch(/\n````$/u);
    expect(rendered).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u);
  });
});
