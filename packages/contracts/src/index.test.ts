import { describe, expect, it } from "vitest";
import { validateSemanticDocument, validateTemplateInventory } from "./index.js";

describe("versioned data contracts", () => {
  it("rejects unsupported schema versions before consumers process the payload", () => {
    expect(validateSemanticDocument({ schemaVersion: 2 })).toContainEqual(expect.objectContaining({
      code: "Schema.UnsupportedVersion",
      severity: "error"
    }));
  });

  it("validates optional metadata and text-run fields", () => {
    const diagnostics = validateSemanticDocument({
      schemaVersion: 1,
      id: "article-1",
      metadata: { title: "Title", author: 42 },
      blocks: [{ id: "body-1", type: "paragraph", content: [{ text: "Text", marks: [], href: 9 }] }]
    });
    expect(diagnostics.map((item) => item.path)).toContain("SemanticDocument.metadata.author");
    expect(diagnostics.map((item) => item.path)).toContain("blocks.0.content.0");
  });

  it("rejects malformed template inventory entries", () => {
    const diagnostics = validateTemplateInventory({
      schemaVersion: 1,
      templateId: "template-1",
      name: "Template",
      pages: [],
      frames: [],
      styles: [],
      requiredAssets: ["", 4]
    });
    expect(diagnostics.filter((item) => item.path?.startsWith("requiredAssets."))).toHaveLength(2);
  });
});
