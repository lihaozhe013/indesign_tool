import type {
  Diagnostic,
  PageRole,
  StyleRole,
  TemplateInventory,
  TemplateRoleAssignments,
  TemplateScan
} from "@folio/contracts";
import { validateTemplateRoleAssignments, validateTemplateScan } from "@folio/contracts";

export interface CreateTemplateInventoryResult {
  inventory?: TemplateInventory;
  diagnostics: Diagnostic[];
}

export function createTemplateInventory(
  scan: TemplateScan,
  assignments: TemplateRoleAssignments
): CreateTemplateInventoryResult {
  const diagnostics = [...validateTemplateScan(scan), ...validateTemplateRoleAssignments(assignments)];
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };

  const pageByRef = new Map([...scan.pages, ...scan.parentPages].map((page) => [page.ref, page]));
  const frameByRef = new Map(scan.frames.map((frame) => [frame.ref, frame]));
  const styleByRef = new Map(scan.styles.map((style) => [style.ref, style]));

  assignments.pageRoles.forEach(({ ref }, index) => {
    if (!pageByRef.has(ref)) diagnostics.push(error("Template.AnnotationTargetMissing", "Page annotation references an unknown page", "pageRoles." + index));
  });
  assignments.frameRoles.forEach(({ ref }, index) => {
    const frame = frameByRef.get(ref);
    if (!frame) diagnostics.push(error("Template.AnnotationTargetMissing", "Frame annotation references an unknown frame", "frameRoles." + index));
    else if (frame.kind === "other") diagnostics.push(error("Template.AnnotationTargetUnsupported", "Only text and graphic frames can receive semantic roles", "frameRoles." + index));
  });
  assignments.styleRoles.forEach(({ ref }, index) => {
    if (!styleByRef.has(ref)) diagnostics.push(error("Template.AnnotationTargetMissing", "Style annotation references an unknown style", "styleRoles." + index));
  });
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };

  const pageRoles = new Map(assignments.pageRoles.map(({ ref, role }) => [ref, role]));
  const frameRoles = new Map(assignments.frameRoles.map(({ ref, role }) => [ref, role]));
  const styleRoles = new Map(assignments.styleRoles.map(({ ref, role }) => [ref, role]));

  // A frame defined on a parent page is provided to every page that applies
  // that parent. Resolve it to the first such page in document order so page
  // role and flow-frame checks can use it; an unapplied parent page keeps its
  // own reference and is reported as detached.
  const firstPageByParentRef = new Map<string, string>();
  for (const page of scan.pages) {
    const parentRef = page.appliedParentPageRef;
    if (parentRef && !firstPageByParentRef.has(parentRef)) firstPageByParentRef.set(parentRef, page.ref);
  }
  const pages: TemplateInventory["pages"] = [...scan.pages, ...scan.parentPages].map((page) => ({
    ref: page.ref,
    name: page.name,
    source: scan.pages.includes(page) ? "page" : "parentPage",
    ...(pageRoles.has(page.ref) ? { role: pageRoles.get(page.ref) as PageRole } : {})
  }));
  const frames: TemplateInventory["frames"] = assignments.frameRoles.map(({ ref, role }) => {
    const frame = frameByRef.get(ref)!;
    const pageRef = frame.pageRef
      ?? (frame.parentPageRef ? firstPageByParentRef.get(frame.parentPageRef) ?? frame.parentPageRef : undefined);
    if (!pageRef) {
      diagnostics.push(error("Template.FramePageMissing", "Annotated frame is not attached to a page", "frames." + ref));
    }
    return {
      ref,
      pageRef: pageRef ?? "",
      name: frame.name,
      role,
      kind: frame.kind === "graphic" ? "graphic" : "text"
    };
  });
  const styles: TemplateInventory["styles"] = scan.styles.map((style) => ({
    kind: style.kind,
    name: style.name,
    qualifiedName: style.qualifiedName,
    ...(styleRoles.has(style.ref) ? { role: styleRoles.get(style.ref) as StyleRole } : {})
  }));
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };

  return {
    inventory: {
      schemaVersion: 1,
      templateId: assignments.templateId,
      name: assignments.name,
      hostVersion: scan.host.version,
      pages,
      frames,
      styles,
      requiredAssets: [...new Set(assignments.requiredAssets)].sort()
    },
    diagnostics
  };
}

function error(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: "error", path };
}
