import { describe, expect, it } from "vitest";
import type { CompiledTemplate, DocumentIR, SemanticDocument } from "@folio/contracts";
import { materializeMainStory, planHostOperations } from "./materialize.js";

const template: CompiledTemplate = {
  schemaVersion: 1,
  templateId: "synthetic-cover-article",
  name: "Synthetic Cover/Article",
  pageRoles: {
    Cover: { sourcePageRef: "page:cover" },
    Article: { sourcePageRef: "page:article", flowFrameRef: "frame:flow" }
  },
  frameRoles: { "article-flow": "frame:flow", "hero-title": "frame:hero-title" },
  styleRoles: {
    ArticleTitle: "Article / H1",
    SectionHeading: "Article / H2",
    Body: "Article / Body",
    Quote: "Article / Quote",
    Caption: "Article / Caption",
    Emphasis: "Article / Emphasis",
    InlineImage: "Article / ImageFrame"
  },
  requiredAssets: []
};

const document: SemanticDocument = {
  schemaVersion: 1,
  id: "article-1",
  metadata: { title: "标题", author: "Author", language: "zh-CN" },
  blocks: [
    { id: "h1", type: "heading", level: 1, content: [{ text: "标题", marks: [] }] },
    {
      id: "p1",
      type: "paragraph",
      content: [
        { text: "中文", marks: [] },
        { text: "强调", marks: ["strong"] },
        { text: "。", marks: [] }
      ]
    },
    { id: "q1", type: "quote", content: [{ text: "引用", marks: [] }] },
    { id: "img1", type: "image", src: "assets/a.png", alt: "图", caption: [{ text: "图注", marks: [] }] },
    { id: "d1", type: "divider" }
  ]
};

const ir: DocumentIR = {
  schemaVersion: 1,
  articleId: "article-1",
  templateId: "synthetic-cover-article",
  pages: [
    { id: "page-cover", role: "Cover", sourcePageRef: "page:cover", stories: [], titleStyleRole: "ArticleTitle" },
    { id: "page-article-001", role: "Article", sourcePageRef: "page:article", stories: ["main"] }
  ],
  stories: {
    main: {
      id: "main",
      blockIds: ["h1", "p1", "q1", "img1", "d1"],
      blockStyleRoles: { h1: "SectionHeading", p1: "Body", q1: "Quote", img1: "InlineImage" },
      captionStyleRoles: ["img1"],
      characterStyleRoles: [{ blockId: "p1", runIndex: 1, styleRole: "Emphasis" }]
    }
  },
  assets: [{ blockId: "img1", source: "assets/a.png", alt: "图" }]
};

describe("materializeMainStory", () => {
  it("builds paragraph-separated story text with resolved styles and inline runs", () => {
    const result = materializeMainStory(document, template, ir);
    expect(result.diagnostics).toEqual([]);
    const story = result.story!;
    expect(story.text).toBe("标题\r中文强调。\r引用\r\r图注\r");
    expect(story.paragraphs.map((paragraph) => [paragraph.blockId, paragraph.styleName ?? null])).toEqual([
      ["h1", "Article / H2"],
      ["p1", "Article / Body"],
      ["q1", "Article / Quote"],
      ["img1", null],
      ["img1", "Article / Caption"],
      ["d1", null]
    ]);
    expect(story.characterRuns).toEqual([
      { paragraphIndex: 1, blockId: "p1", start: 2, end: 4, styleRole: "Emphasis", styleName: "Article / Emphasis" }
    ]);
  });

  it("reports unresolved style roles without dropping the paragraph", () => {
    const withoutQuote: CompiledTemplate = {
      ...template,
      styleRoles: { ...template.styleRoles, Quote: undefined }
    };
    const result = materializeMainStory(document, withoutQuote, ir);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "Template.StyleMissingForContent" }));
    const quoteParagraph = result.story?.paragraphs.find((paragraph) => paragraph.blockId === "q1");
    expect(quoteParagraph?.text).toBe("引用");
    expect(quoteParagraph?.styleName).toBeUndefined();
  });
});

describe("planHostOperations", () => {
  it("emits a deterministic, serializable host plan in document order", () => {
    const first = planHostOperations(document, template, ir);
    const second = planHostOperations(document, template, ir);
    expect(first.diagnostics).toEqual([]);
    expect(first.plan).toEqual(second.plan);
    expect(JSON.parse(JSON.stringify(first.plan))).toEqual(first.plan);
    expect(first.plan?.operations).toEqual([
      { op: "apply-parent-page", pageId: "page-cover", role: "Cover", sourcePageRef: "page:cover" },
      { op: "apply-parent-page", pageId: "page-article-001", role: "Article", sourcePageRef: "page:article" },
      { op: "adopt-parent-frame", pageId: "page-article-001", frameRole: "article-flow" },
      { op: "ensure-frame-threading", pageIds: ["page-article-001"], storyId: "main" },
      { op: "set-story-text", storyId: "main", text: "标题\r中文强调。\r引用\r\r图注\r" },
      { op: "apply-paragraph-style", storyId: "main", paragraphIndex: 0, blockId: "h1", styleName: "Article / H2" },
      { op: "apply-paragraph-style", storyId: "main", paragraphIndex: 1, blockId: "p1", styleName: "Article / Body" },
      { op: "apply-paragraph-style", storyId: "main", paragraphIndex: 2, blockId: "q1", styleName: "Article / Quote" },
      { op: "apply-paragraph-style", storyId: "main", paragraphIndex: 4, blockId: "img1", styleName: "Article / Caption" },
      { op: "apply-character-style", storyId: "main", paragraphIndex: 1, start: 2, end: 4, blockId: "p1", styleName: "Article / Emphasis" },
      { op: "place-inline-image", storyId: "main", paragraphIndex: 3, blockId: "img1", source: "assets/a.png", objectStyleName: "Article / ImageFrame" }
    ]);
  });
});