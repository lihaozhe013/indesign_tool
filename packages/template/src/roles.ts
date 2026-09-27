import type {
  Diagnostic,
  PageRole,
  StyleRole,
  TemplateRoleAssignments,
  TemplateScan
} from "@folio/contracts";
import { validateTemplateScan } from "@folio/contracts";

const PAGE_ROLES: PageRole[] = ["Cover", "Article", "Ending", "ImageFeature"];
const STYLE_ROLES: StyleRole[] = [
  "ArticleTitle",
  "Subtitle",
  "SectionHeading",
  "Subheading",
  "Body",
  "Quote",
  "Caption",
  "Emphasis",
  "Link",
  "Code",
  "InlineImage",
  "HeroImage"
];

export interface DeriveRoleAssignmentsOptions {
  templateId: string;
  name: string;
}

export interface DeriveRoleAssignmentsResult {
  assignments?: TemplateRoleAssignments;
  diagnostics: Diagnostic[];
}

/**
 * Build role assignments from the role labels a designer set in InDesign, so
 * the manifest is generated instead of hand-authored. Page and style labels
 * must name a known role; frame labels are open-ended role names because the
 * publishing planner defines frame roles such as article-flow.
 */
export function deriveRoleAssignments(
  scan: TemplateScan,
  options: DeriveRoleAssignmentsOptions
): DeriveRoleAssignmentsResult {
  const diagnostics = [...validateTemplateScan(scan)];
  if (!scan || typeof scan !== "object") return { diagnostics };
  if (!options.templateId.trim() || !options.name.trim()) {
    diagnostics.push(error("Template.IdentityMissing", "templateId and name are required", "templateId"));
  }
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };

  const pageRoles: TemplateRoleAssignments["pageRoles"] = [];
  const styleRoles: TemplateRoleAssignments["styleRoles"] = [];
  const frameRoles: TemplateRoleAssignments["frameRoles"] = [];

  for (const page of [...scan.pages, ...scan.parentPages]) {
    const label = page.roleLabel;
    if (!label) continue;
    if (!PAGE_ROLES.includes(label as PageRole)) {
      diagnostics.push(error("Template.UnknownRole", "Unknown page role label: " + label, "pages." + page.ref));
      continue;
    }
    pageRoles.push({ ref: page.ref, role: label as PageRole });
  }

  for (const frame of scan.frames) {
    const label = frame.roleLabel;
    if (!label) continue;
    frameRoles.push({ ref: frame.ref, role: label });
  }

  for (const style of scan.styles) {
    const label = style.roleLabel;
    if (!label) continue;
    if (!STYLE_ROLES.includes(label as StyleRole)) {
      diagnostics.push(error("Template.UnknownRole", "Unknown style role label: " + label, "styles." + style.ref));
      continue;
    }
    styleRoles.push({ ref: style.ref, role: label as StyleRole });
  }

  const duplicatePageRoles = findDuplicate(pageRoles.map((entry) => entry.role));
  for (const role of duplicatePageRoles) {
    diagnostics.push(error("Template.PageRoleAmbiguous", "Multiple pages declare role label " + role, "pages." + role));
  }
  const duplicateFrameRoles = findDuplicate(frameRoles.map((entry) => entry.role));
  for (const role of duplicateFrameRoles) {
    // article-flow is allowed to appear more than once only when the extra
    // frames are resolved to different pages by the inventory step; flag it
    // here so the compile step reports the real ambiguity.
    if (role !== "article-flow") {
      diagnostics.push(error("Template.FrameRoleAmbiguous", "Multiple frames declare role label " + role, "frames." + role));
    }
  }

  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };
  return {
    assignments: {
      schemaVersion: 1,
      templateId: options.templateId,
      name: options.name,
      pageRoles,
      frameRoles,
      styleRoles,
      requiredAssets: []
    },
    diagnostics
  };
}

function findDuplicate(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function error(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: "error", path };
}