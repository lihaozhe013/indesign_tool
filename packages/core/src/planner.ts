import type {
  CompiledTemplate,
  Diagnostic,
  DocumentIR,
  DocumentPageIR,
  HostObservation,
  SemanticDocument
} from "@folio/contracts";

export interface PlanningResult {
  ir?: DocumentIR;
  diagnostics: Diagnostic[];
}

export function planDocument(document: SemanticDocument, template: CompiledTemplate): PlanningResult {
  const diagnostics: Diagnostic[] = [];
  if (!template.pageRoles.Cover) diagnostics.push(error("Template.PageRoleMissing", "Template has no Cover page role"));
  if (!template.pageRoles.Article?.flowFrameRef) diagnostics.push(error("Template.ArticleFlowMissing", "Template has no Article flow frame"));
  if (!template.styleRoles.ArticleTitle) diagnostics.push(error("Template.StyleMissing", "Template has no ArticleTitle style"));
  if (document.metadata.subtitle && !template.styleRoles.Subtitle) diagnostics.push(error("Template.StyleMissingForContent", "Article has a subtitle but template has no Subtitle style"));
  const blockStyleRoles: Record<string, "SectionHeading" | "Subheading" | "Body" | "Quote" | "InlineImage"> = {};
  const captionStyleRoles: string[] = [];
  const characterStyleRoles: Array<{ blockId: string; runIndex: number; styleRole: "Emphasis" | "Link" | "Code" }> = [];
  for (const block of document.blocks) {
    const role = block.type === "heading" ? (block.level > 2 ? "Subheading" : "SectionHeading")
      : block.type === "quote" ? "Quote"
        : block.type === "image" ? "InlineImage"
          : block.type === "divider" ? undefined
            : "Body";
    if (role) {
      if (!template.styleRoles[role]) diagnostics.push(error("Template.StyleMissingForContent", "Article block " + block.id + " requires style role " + role));
      else blockStyleRoles[block.id] = role;
    }
    if (block.type === "image" && block.caption && !template.styleRoles.Caption) {
      diagnostics.push(error("Template.StyleMissingForContent", "Image block " + block.id + " requires style role Caption"));
    }
    if (block.type === "image" && block.caption) captionStyleRoles.push(block.id);
    const runs = block.type === "image" ? block.caption ?? [] : "content" in block ? block.content : [];
    runs.forEach((run, runIndex) => {
      const roles: Array<"Emphasis" | "Link" | "Code"> = [];
      if (run.marks.includes("strong") || run.marks.includes("emphasis")) roles.push("Emphasis");
      if (run.marks.includes("link")) roles.push("Link");
      if (run.marks.includes("code")) roles.push("Code");
      for (const styleRole of roles) {
        if (!template.styleRoles[styleRole]) diagnostics.push(error("Template.StyleMissingForContent", "Text in block " + block.id + " requires style role " + styleRole));
        else characterStyleRoles.push({ blockId: block.id, runIndex, styleRole });
      }
    });
  }
  if (diagnostics.length) return { diagnostics };

  const pages: DocumentPageIR[] = [
    {
      id: "page-cover",
      role: "Cover",
      sourcePageRef: template.pageRoles.Cover!.sourcePageRef,
      stories: [],
      titleStyleRole: "ArticleTitle",
      ...(document.metadata.subtitle ? { subtitleStyleRole: "Subtitle" as const } : {})
    },
    { id: "page-article-001", role: "Article", sourcePageRef: template.pageRoles.Article!.sourcePageRef, stories: ["main"] }
  ];
  if (template.pageRoles.Ending) {
    pages.push({ id: "page-ending", role: "Ending", sourcePageRef: template.pageRoles.Ending.sourcePageRef, stories: [] });
  }
  return {
    ir: {
      schemaVersion: 1,
      articleId: document.id,
      templateId: template.templateId,
      pages,
      stories: { main: { id: "main", blockIds: document.blocks.map((block) => block.id), blockStyleRoles, captionStyleRoles, characterStyleRoles } },
      assets: document.blocks.flatMap((block) => block.type === "image"
        ? [{ blockId: block.id, source: block.src, alt: block.alt }]
        : [])
    },
    diagnostics
  };
}

export interface ReflowOptions {
  maxPages?: number;
}

export interface ReflowResult {
  ir: DocumentIR;
  diagnostics: Diagnostic[];
  addedPages: number;
  complete: boolean;
}

export function respondToObservation(
  ir: DocumentIR,
  template: CompiledTemplate,
  observation: HostObservation,
  options: ReflowOptions = {}
): ReflowResult {
  const diagnostics: Diagnostic[] = [];
  const maxPages = options.maxPages ?? 500;
  for (const asset of observation.missingAssets) {
    diagnostics.push({ code: "Asset.Missing", message: "Asset could not be placed: " + asset, severity: "error", context: { source: asset } });
  }
  for (const font of observation.missingFonts) {
    diagnostics.push({ code: "Font.Missing", message: "Font substitution or missing font: " + font, severity: "warning", context: { font } });
  }
  if (diagnostics.some((item) => item.severity === "error")) {
    return { ir, diagnostics, addedPages: 0, complete: false };
  }
  if (!observation.overset.length) return { ir, diagnostics, addedPages: 0, complete: true };

  const mainOverflow = observation.overset.filter((item) => item.storyId === "main");
  if (!mainOverflow.length) {
    diagnostics.push({ code: "Story.UnexpectedOverset", message: "Host reported overset for an unknown story", severity: "error" });
    return { ir, diagnostics, addedPages: 0, complete: false };
  }
  const articleRole = template.pageRoles.Article;
  if (!articleRole?.flowFrameRef) {
    diagnostics.push({ code: "Template.ArticleFlowMissing", message: "Cannot extend the main story because Article flow is unavailable", severity: "error" });
    return { ir, diagnostics, addedPages: 0, complete: false };
  }
  if (ir.pages.length >= maxPages) {
    diagnostics.push({ code: "Story.PageLimitReached", message: "Reflow reached its page limit of " + maxPages, severity: "error", context: { maxPages } });
    return { ir, diagnostics, addedPages: 0, complete: false };
  }

  const articlePages = ir.pages.filter((page) => page.role === "Article");
  const nextNumber = articlePages.length + 1;
  const newPage: DocumentPageIR = {
    id: "page-article-" + String(nextNumber).padStart(3, "0"),
    role: "Article",
    sourcePageRef: articleRole.sourcePageRef,
    stories: ["main"]
  };
  const endingIndex = ir.pages.findIndex((page) => page.role === "Ending");
  const insertAt = endingIndex < 0 ? ir.pages.length : endingIndex;
  const pages = [...ir.pages.slice(0, insertAt), newPage, ...ir.pages.slice(insertAt)];
  return {
    ir: { ...ir, pages },
    diagnostics,
    addedPages: 1,
    complete: false
  };
}

function error(code: string, message: string): Diagnostic {
  return { code, message, severity: "error" };
}
