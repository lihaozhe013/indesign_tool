import { describe, expect, it } from "vitest";
import type { TemplateRoleAssignments, TemplateScan } from "@publisher/contracts";
import { compileTemplate } from "./index.js";
import { createTemplateInventory } from "./scan.js";

const scan: TemplateScan = {
  schemaVersion: 1,
  host: { application: "InDesign", version: "21.0.0.192", domVersion: "21.0" },
  document: {
    name: "Sample",
    modified: false,
    horizontalMeasurementUnits: "POINTS",
    verticalMeasurementUnits: "POINTS",
    pageCount: 1,
    spreadCount: 1,
    parentPageCount: 1,
    storyCount: 1
  },
  pages: [{ ref: "page:1", index: 0, name: "Cover" }],
  parentPages: [{ ref: "parent:1", index: 0, name: "Article parent" }],
  frames: [{ ref: "frame:1", index: 0, name: "Flow", kind: "text", parentPageRef: "parent:1", storyRef: "story:1" }],
  stories: [{ ref: "story:1", index: 0, textLength: 0, overset: false, frameRefs: ["frame:1"] }],
  styles: [
    { ref: "style:1", index: 0, kind: "paragraph", name: "Title", qualifiedName: "Article / Title" },
    { ref: "style:2", index: 1, kind: "paragraph", name: "Heading", qualifiedName: "Article / Heading" },
    { ref: "style:3", index: 2, kind: "paragraph", name: "Body", qualifiedName: "Article / Body" }
  ],
  assets: [],
  fonts: []
};

const assignments: TemplateRoleAssignments = {
  schemaVersion: 1,
  templateId: "sample-template",
  name: "Sample",
  pageRoles: [{ ref: "page:1", role: "Cover" }, { ref: "parent:1", role: "Article" }],
  frameRoles: [{ ref: "frame:1", role: "article-flow" }],
  styleRoles: [
    { ref: "style:1", role: "ArticleTitle" },
    { ref: "style:2", role: "SectionHeading" },
    { ref: "style:3", role: "Body" }
  ],
  requiredAssets: []
};

describe("createTemplateInventory", () => {
  it("projects designer role assignments into the existing compiler input", () => {
    const result = createTemplateInventory(scan, assignments);
    expect(result.diagnostics).toEqual([]);
    expect(result.inventory?.pages.map(({ source, role }) => [source, role])).toEqual([
      ["page", "Cover"], ["parentPage", "Article"]
    ]);
    expect(result.inventory?.frames[0]).toMatchObject({ pageRef: "parent:1", role: "article-flow", kind: "text" });
    expect(compileTemplate(result.inventory!).template?.styleRoles.Body).toBe("Article / Body");
  });

  it("reports stale annotation references without creating a partial inventory", () => {
    const result = createTemplateInventory(scan, {
      ...assignments,
      frameRoles: [{ ref: "frame:removed", role: "article-flow" }]
    });
    expect(result.inventory).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "Template.AnnotationTargetMissing" }));
  });
});
