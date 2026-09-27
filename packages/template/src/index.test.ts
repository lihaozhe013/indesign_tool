import { describe, expect, it } from "vitest";
import { makeInventory } from "@folio/test-support";
import { compileTemplate } from "./index.js";

describe("compileTemplate", () => {
  it("compiles page, flow-frame, and named style roles deterministically", () => {
    const result = compileTemplate(makeInventory());
    expect(result.diagnostics).toEqual([]);
    expect(result.template?.pageRoles.Article?.flowFrameRef).toBe("article-flow-frame");
    expect(result.template?.styleRoles.Body).toBe("Editorial / Body");
  });

  it("reports missing page roles, styles, and flow frames", () => {
    const inventory = makeInventory();
    inventory.pages = inventory.pages.filter((page) => page.role !== "Cover");
    inventory.frames = [];
    inventory.styles = inventory.styles.filter((style) => style.name !== "Body");
    const result = compileTemplate(inventory);
    expect(result.template).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "Template.PageRoleMissing", "Template.ArticleFlowMissing", "Template.StyleMissing"
    ]));
  });

  it("rejects duplicate flow references and style kind mismatches", () => {
    const inventory = makeInventory();
    inventory.frames.push({ ref: "duplicate-flow", pageRef: "article-page", name: "Second flow", role: "article-flow", kind: "text" });
    inventory.styles.find((style) => style.name === "Body")!.kind = "character";
    const result = compileTemplate(inventory);
    expect(result.diagnostics.map((item) => item.code)).toContain("Template.ArticleFlowAmbiguous");
    expect(result.diagnostics.map((item) => item.code)).toContain("Template.StyleKindMismatch");
  });

  it("uses plugin-assigned semantic style roles even when designers use different style names", () => {
    const inventory = makeInventory();
    const body = inventory.styles.find((style) => style.name === "Body")!;
    body.name = "Paragraph / Chinese";
    body.qualifiedName = "Editorial / Paragraph / Chinese";
    body.role = "Body";
    const result = compileTemplate(inventory);
    expect(result.template?.styleRoles.Body).toBe("Editorial / Paragraph / Chinese");
  });

  it("rejects repeated frame roles instead of silently overwriting their mapping", () => {
    const inventory = makeInventory();
    inventory.frames.push({ ref: "duplicate-caption", pageRef: "article-page", name: "Caption frame", role: "caption", kind: "text" });
    inventory.frames.push({ ref: "duplicate-caption-2", pageRef: "article-page", name: "Another caption", role: "caption", kind: "text" });
    expect(compileTemplate(inventory).diagnostics.map((item) => item.code)).toContain("Template.FrameRoleAmbiguous");
  });
});
