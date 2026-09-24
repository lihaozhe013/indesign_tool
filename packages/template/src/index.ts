import type {
  CompiledPageRole,
  CompiledTemplate,
  Diagnostic,
  PageRole,
  StyleKind,
  StyleRole,
  TemplateFrame,
  TemplateInventory
} from "@publisher/contracts";
import { validateVersionedObject } from "@publisher/contracts";
export { createTemplateInventory } from "./scan.js";
export type { CreateTemplateInventoryResult } from "./scan.js";

const requiredPages: PageRole[] = ["Cover", "Article"];
const requiredStyles: StyleRole[] = ["ArticleTitle", "SectionHeading", "Body"];
const styleKinds: Record<StyleRole, StyleKind> = {
  ArticleTitle: "paragraph",
  Subtitle: "paragraph",
  SectionHeading: "paragraph",
  Subheading: "paragraph",
  Body: "paragraph",
  Quote: "paragraph",
  Caption: "paragraph",
  Emphasis: "character",
  Link: "character",
  Code: "character",
  InlineImage: "object",
  HeroImage: "object"
};

export interface CompileTemplateResult {
  template?: CompiledTemplate;
  diagnostics: Diagnostic[];
}

export function compileTemplate(inventory: TemplateInventory): CompileTemplateResult {
  const diagnostics: Diagnostic[] = [...validateVersionedObject(inventory, "TemplateInventory")];
  if (!inventory.templateId.trim()) diagnostics.push(error("Template.IdentityMissing", "Template identity is required", "templateId"));
  if (!inventory.name.trim()) diagnostics.push(error("Template.NameMissing", "Template name is required", "name"));

  assertUnique(inventory.pages.map((page) => page.ref), "Template.DuplicatePageRef", "pages", diagnostics);
  assertUnique(inventory.frames.map((frame) => frame.ref), "Template.DuplicateFrameRef", "frames", diagnostics);

  const pagesByRole = new Map<PageRole, typeof inventory.pages>();
  for (const page of inventory.pages) {
    if (!page.role) continue;
    const pages = pagesByRole.get(page.role) ?? [];
    pages.push(page);
    pagesByRole.set(page.role, pages);
  }
  for (const role of requiredPages) {
    if (!pagesByRole.has(role)) diagnostics.push(error("Template.PageRoleMissing", "Required page role is missing: " + role, "pages." + role));
  }
  for (const [role, pages] of pagesByRole) {
    if (pages.length > 1) diagnostics.push(error("Template.PageRoleAmbiguous", "Multiple pages declare role " + role, "pages." + role));
  }

  const pageRefs = new Set(inventory.pages.map((page) => page.ref));
  const framesByRole = new Map<string, TemplateFrame[]>();
  for (const frame of inventory.frames) {
    if (!pageRefs.has(frame.pageRef)) diagnostics.push(error("Template.FramePageMissing", "Frame references unknown page " + frame.pageRef, "frames." + frame.ref));
    const matches = framesByRole.get(frame.role) ?? [];
    matches.push(frame);
    framesByRole.set(frame.role, matches);
  }
  const articlePage = pagesByRole.get("Article")?.[0];
  const articleFlowFrames = framesByRole.get("article-flow") ?? [];
  if (articlePage && !articleFlowFrames.some((frame) => frame.pageRef === articlePage.ref && frame.kind === "text")) {
    diagnostics.push(error("Template.ArticleFlowMissing", "The Article page must provide a text frame with role article-flow", "frames.article-flow"));
  }
  if (articleFlowFrames.length > 1) {
    diagnostics.push(error("Template.ArticleFlowAmbiguous", "Only one article-flow frame is supported in v1", "frames.article-flow"));
  }
  for (const [role, frames] of framesByRole) {
    if (role !== "article-flow" && frames.length > 1) {
      diagnostics.push(error("Template.FrameRoleAmbiguous", "Multiple frames declare role " + role, "frames." + role));
    }
  }

  const styleRoles: Partial<Record<StyleRole, string>> = {};
  for (const role of Object.keys(styleKinds) as StyleRole[]) {
    const matches = inventory.styles.filter((style) => style.role === role || style.name === role || style.qualifiedName === role);
    const expectedKind = styleKinds[role];
    const correctlyTyped = matches.filter((style) => style.kind === expectedKind);
    if (correctlyTyped.length > 1) diagnostics.push(error("Template.StyleAmbiguous", `Multiple styles match role ${role}`, `styles.${role}`));
    else if (correctlyTyped.length === 1) styleRoles[role] = correctlyTyped[0]!.qualifiedName;
    else if (matches.length) {
      diagnostics.push(error("Template.StyleKindMismatch", `Style role ${role} must use a ${expectedKind} style`, `styles.${role}`));
    }
    else if (requiredStyles.includes(role)) {
      diagnostics.push(error("Template.StyleMissing", "Required style role is missing: " + role, "styles." + role));
    }
  }

  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };
  const pageRoles: Partial<Record<PageRole, CompiledPageRole>> = {};
  for (const [role, pages] of pagesByRole) {
    const page = pages[0]!;
    const flow = role === "Article" ? articleFlowFrames.find((frame) => frame.pageRef === page.ref && frame.kind === "text") : undefined;
    pageRoles[role] = { sourcePageRef: page.ref, ...(flow ? { flowFrameRef: flow.ref } : {}) };
  }
  const frameRoles = Object.fromEntries(inventory.frames.map((frame) => [frame.role, frame.ref]));
  return {
    template: {
      schemaVersion: 1,
      templateId: inventory.templateId,
      name: inventory.name,
      pageRoles,
      frameRoles,
      styleRoles,
      requiredAssets: [...new Set(inventory.requiredAssets)].sort()
    },
    diagnostics
  };
}

function assertUnique(values: string[], code: string, path: string, diagnostics: Diagnostic[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(error(code, "Duplicate reference: " + value, path));
    seen.add(value);
  }
}

function error(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: "error", path };
}
