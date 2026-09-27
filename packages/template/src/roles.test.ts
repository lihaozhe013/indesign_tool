import { describe, expect, it } from "vitest";
import type { TemplateScan } from "@folio/contracts";
import { compileTemplate } from "./index.js";
import { createTemplateInventory } from "./scan.js";
import { deriveRoleAssignments } from "./roles.js";

function buildScan(overrides: Partial<TemplateScan> = {}): TemplateScan {
  return {
    schemaVersion: 1,
    host: { application: "InDesign", version: "21.0.0.192", domVersion: "21.0" },
    document: {
      name: "synthetic-cover-article.indd",
      modified: false,
      horizontalMeasurementUnits: "MILLIMETERS",
      verticalMeasurementUnits: "MILLIMETERS",
      pageCount: 2,
      spreadCount: 2,
      parentPageCount: 1,
      storyCount: 2
    },
    pages: [
      { ref: "page:1", index: 0, name: "1", roleLabel: "Cover" },
      { ref: "page:2", index: 1, name: "2", roleLabel: "Article", appliedParentPageRef: "parent:1" }
    ],
    parentPages: [{ ref: "parent:1", index: 0, name: "A" }],
    frames: [
      { ref: "frame:hero-title", index: 0, name: "Hero Title", kind: "text", pageRef: "page:1", roleLabel: "hero-title" },
      { ref: "frame:hero-image", index: 1, name: "Hero Image", kind: "graphic", pageRef: "page:1", roleLabel: "hero-image" },
      { ref: "frame:flow", index: 2, name: "Flow", kind: "text", parentPageRef: "parent:1", roleLabel: "article-flow", storyRef: "story:1" },
      { ref: "frame:page-number", index: 3, name: "Page Number", kind: "text", parentPageRef: "parent:1", roleLabel: "page-number", storyRef: "story:2" }
    ],
    stories: [
      { ref: "story:1", index: 0, textLength: 0, overset: false, frameRefs: ["frame:flow"] },
      { ref: "story:2", index: 1, textLength: 1, overset: false, frameRefs: ["frame:page-number"] }
    ],
    styles: [
      { ref: "style:h1", index: 0, kind: "paragraph", name: "Article / H1", qualifiedName: "Article / H1", roleLabel: "ArticleTitle" },
      { ref: "style:h2", index: 1, kind: "paragraph", name: "Article / H2", qualifiedName: "Article / H2", roleLabel: "SectionHeading" },
      { ref: "style:body", index: 2, kind: "paragraph", name: "Article / Body", qualifiedName: "Article / Body", roleLabel: "Body" },
      { ref: "style:quote", index: 3, kind: "paragraph", name: "Article / Quote", qualifiedName: "Article / Quote", roleLabel: "Quote" },
      { ref: "style:emphasis", index: 4, kind: "character", name: "Article / Emphasis", qualifiedName: "Article / Emphasis", roleLabel: "Emphasis" },
      { ref: "style:image", index: 5, kind: "object", name: "Article / ImageFrame", qualifiedName: "Article / ImageFrame", roleLabel: "HeroImage" }
    ],
    assets: [],
    fonts: [],
    ...overrides
  };
}

describe("deriveRoleAssignments", () => {
  it("derives assignments from designer role labels and compiles the template", () => {
    const result = deriveRoleAssignments(buildScan(), { templateId: "synthetic", name: "Synthetic" });
    expect(result.diagnostics).toEqual([]);
    expect(result.assignments?.pageRoles).toEqual([
      { ref: "page:1", role: "Cover" },
      { ref: "page:2", role: "Article" }
    ]);
    expect(result.assignments?.frameRoles).toHaveLength(4);

    const inventory = createTemplateInventory(buildScan(), result.assignments!);
    expect(inventory.diagnostics).toEqual([]);
    const compiled = compileTemplate(inventory.inventory!);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.template?.pageRoles.Article).toEqual({ sourcePageRef: "page:2", flowFrameRef: "frame:flow" });
    expect(compiled.template?.styleRoles).toMatchObject({
      ArticleTitle: "Article / H1",
      SectionHeading: "Article / H2",
      Body: "Article / Body",
      Quote: "Article / Quote",
      Emphasis: "Article / Emphasis",
      HeroImage: "Article / ImageFrame"
    });
  });

  it("rejects unknown page and style role labels", () => {
    const scan = buildScan();
    scan.pages[0]!.roleLabel = "cover-page";
    scan.styles[2]!.roleLabel = "text";
    const result = deriveRoleAssignments(scan, { templateId: "synthetic", name: "Synthetic" });
    expect(result.assignments).toBeUndefined();
    expect(result.diagnostics.filter((item) => item.code === "Template.UnknownRole")).toHaveLength(2);
  });

  it("requires template identity", () => {
    const result = deriveRoleAssignments(buildScan(), { templateId: "  ", name: "Synthetic" });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "Template.IdentityMissing" }));
  });
});