import { describe, expect, it } from "vitest";
import type { DocumentDump, SemanticDocument } from "@folio/contracts";
import { parseArticle } from "@folio/core";
import { verifyDocumentDump } from "./publication-verification.js";

const article = parseArticle(`---
title: Document verification
subtitle: Reopened output check
---

# Document verification

\u6b63\u6587\u4e2d\u7684\u4e2d\u6587\u4e0e English text must survive exactly.

![A figure](assets/figure.png "Caption text")
`).document!;

function dumpFor(document: SemanticDocument): DocumentDump {
  const paragraphs: DocumentDump["stories"][number]["paragraphs"] = [];
  for (const block of document.blocks) {
    if (block.type === "divider") continue;
    if (block.type === "image") {
      paragraphs.push({ semanticId: block.id, text: "" });
      if (block.caption) paragraphs.push({ semanticId: block.id, text: block.caption.map((run) => run.text).join("") });
      continue;
    }
    paragraphs.push({ semanticId: block.id, text: block.content.map((run) => run.text).join("") });
  }
  return {
    schemaVersion: 1,
    pages: [{ id: "page-cover", index: 0, role: "Cover" }, { id: "page-article-001", index: 1, role: "Article" }],
    stories: [{ id: "story-main", overset: false, paragraphs }],
    frames: [
      { semanticRole: "hero-title", pageIndex: 0, text: document.metadata.title },
      { semanticRole: "hero-subtitle", pageIndex: 0, text: document.metadata.subtitle }
    ],
    missingAssets: [],
    missingFonts: []
  };
}

describe("verifyDocumentDump", () => {
  it("accepts saved title, subtitle, body text, and image caption", () => {
    expect(verifyDocumentDump(dumpFor(article), article)).toEqual([]);
  });

  it("rejects lost text, residual overflow, and missing assets while retaining font warnings", () => {
    const dump = dumpFor(article);
    dump.stories[0]!.overset = true;
    dump.stories[0]!.paragraphs[0]!.text = "Truncated body";
    dump.missingAssets = ["assets/figure.png"];
    dump.missingFonts = ["Example Sans"];

    expect(verifyDocumentDump(dump, article).map((item) => [item.code, item.severity])).toEqual([
      ["Story.UnexpectedOverset", "error"],
      ["Document.TextChanged", "error"],
      ["Asset.Missing", "error"],
      ["Font.Missing", "warning"]
    ]);
  });

  it("rejects a subtitle that has no matching cover frame", () => {
    const dump = dumpFor(article);
    dump.frames = dump.frames.filter((frame) => frame.semanticRole !== "hero-subtitle");

    expect(verifyDocumentDump(dump, article).map((item) => item.code)).toContain("Document.CoverSubtitleChanged");
  });
});
