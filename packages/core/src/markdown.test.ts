import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { stableJson, validateSemanticDocument } from "@folio/contracts";
import { parseArticle } from "./markdown.js";
import { validateAssetReferences } from "./assets.js";

describe("parseArticle", () => {
  it("preserves Chinese text, inline marks, quotes, image captions, and order", async () => {
    const source = await readFile(new URL("../../../fixtures/articles/basic.md", import.meta.url), "utf8");
    const result = parseArticle(source, { sourceId: "basic" });
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.metadata.title).toBe("Why we chose this tool");
    expect(result.document?.blocks.map((block) => block.type)).toEqual([
      "paragraph", "heading", "paragraph", "quote", "image", "divider", "heading", "paragraph"
    ]);
    const firstParagraph = result.document?.blocks[0];
    expect(firstParagraph?.type).toBe("paragraph");
    if (firstParagraph?.type === "paragraph") {
      expect(firstParagraph.content.map((run) => run.text).join("")).toContain("punctuation");
      expect(firstParagraph.content.some((run) => run.marks.includes("strong"))).toBe(true);
    }
    const image = result.document?.blocks.find((block) => block.type === "image");
    expect(image?.type === "image" ? image.caption?.[0]?.text : undefined).toBe("A sample figure");
  });

  it("reports title mismatch and unsupported table syntax", async () => {
    const mismatch = parseArticle("---\ntitle: Frontmatter\n---\n\n# Different\n");
    expect(mismatch.diagnostics.map((item) => item.code)).toContain("Article.TitleMismatch");
    const table = await readFile(new URL("../../../fixtures/articles/unsupported-table.md", import.meta.url), "utf8");
    expect(parseArticle(table).diagnostics.map((item) => item.code)).toContain("Article.BlockUnsupported");
  });

  it("produces deterministic identifiers for unchanged blocks when another block is inserted", () => {
    const before = parseArticle("# Title\n\nStable body.");
    const after = parseArticle("# Title\n\nNew body.\n\nStable body.");
    expect(before.document?.blocks[0]?.id).toBe(after.document?.blocks[1]?.id);
  });

  it("round trips through canonical JSON and validates the versioned schema", () => {
    const result = parseArticle("# Title\n\nParagraph.");
    expect(result.document).toBeDefined();
    const restored: unknown = JSON.parse(stableJson(result.document));
    expect(validateSemanticDocument(restored)).toEqual([]);
  });

  it("validates local image availability without adding filesystem access to core", async () => {
    const source = await readFile(new URL("../../../fixtures/articles/missing-image.md", import.meta.url), "utf8");
    const document = parseArticle(source).document!;
    const diagnostics = validateAssetReferences(document, () => false);
    expect(diagnostics.map((item) => item.code)).toEqual(["Asset.Missing"]);
  });

  it("preserves Chinese punctuation and mixed English from the encoded fixture", async () => {
    const fixture = JSON.parse(await readFile(new URL("../../../fixtures/articles/chinese-mixed.json", import.meta.url), "utf8")) as { markdown: string };
    const result = parseArticle(fixture.markdown, { sourceId: "chinese-mixed" });
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.metadata.title).toBe("\u4e3a\u4ec0\u4e48\u4f7f\u7528 InDesign");
    const sourceText = result.document?.blocks
      .flatMap((block) => block.type === "divider" ? [] : block.type === "image" ? block.caption ?? [] : block.content)
      .map((run) => run.text).join("");
    expect(sourceText).toContain("\u4e2d\u6587\u6b63\u6587");
    expect(sourceText).toContain("English words");
  });

  it("parses a very large article while preserving every paragraph", () => {
    const body = Array.from({ length: 1200 }, (_, index) => "\u7b2c " + index + " \u6bb5 mixed \u5185\u5bb9\u3002").join("\n\n");
    const document = parseArticle("# Large article\n\n" + body).document;
    expect(document?.blocks).toHaveLength(1200);
  });

  it("parses a wide range of ordinary Unicode paragraphs without losing text", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("a", "\u4e2d", "\u6587", "\u3002", "!", "\u00e9"), { minLength: 1, maxLength: 100 }),
      (characters) => {
        const text = characters.join("");
        const result = parseArticle("# Property title\n\n" + text);
        expect(result.document?.blocks[0]?.type).toBe("paragraph");
        const block = result.document?.blocks[0];
        if (block?.type !== "paragraph") return false;
        return block.content.map((run) => run.text).join("") === text;
      }
    ), { numRuns: 100 });
  });
});
