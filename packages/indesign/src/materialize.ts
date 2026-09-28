import type {
  CompiledTemplate,
  Diagnostic,
  DocumentIR,
  PageRole,
  SemanticBlock,
  SemanticDocument,
  StyleRole
} from "@folio/contracts";

/**
 * Host-independent description of the work the InDesign driver performs for a
 * planned document. The plan is data: it is deterministic, serializable, and
 * contains no DOM access, so it can be tested without InDesign and handed to
 * the UXP driver as a constrained job payload.
 */

export interface MaterializedParagraph {
  index: number;
  blockId: string;
  styleRole?: StyleRole;
  styleName?: string;
  text: string;
}

export interface MaterializedCharacterRun {
  paragraphIndex: number;
  blockId: string;
  start: number;
  end: number;
  styleRole: "Emphasis" | "Link" | "Code";
  styleName?: string;
}

export interface MaterializedStory {
  storyId: string;
  text: string;
  paragraphs: MaterializedParagraph[];
  characterRuns: MaterializedCharacterRun[];
}

export type HostOperation =
  | { op: "apply-parent-page"; pageId: string; role: PageRole; sourcePageRef: string }
  | { op: "adopt-parent-frame"; pageId: string; frameRole: string }
  | { op: "set-story-text"; storyId: string; text: string }
  | { op: "apply-paragraph-style"; storyId: string; paragraphIndex: number; blockId: string; styleName: string }
  | { op: "apply-character-style"; storyId: string; paragraphIndex: number; start: number; end: number; blockId: string; styleName: string }
  | { op: "place-inline-image"; storyId: string; paragraphIndex: number; blockId: string; source: string; alt: string; objectStyleName?: string }
  | { op: "place-image-placeholder"; storyId: string; paragraphIndex: number; blockId: string; source: string; alt: string }
  | { op: "ensure-frame-threading"; pageIds: string[]; storyId: string };

export interface HostPlanResult {
  plan?: { schemaVersion: 1; operations: HostOperation[]; story: MaterializedStory };
  diagnostics: Diagnostic[];
}

const paragraphSeparator = "\r";

export function materializeMainStory(
  document: SemanticDocument,
  template: CompiledTemplate,
  ir: DocumentIR
): { story?: MaterializedStory; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const storyIr = ir.stories.main;
  if (!storyIr) {
    diagnostics.push(fallbackError("Document.StoryMissing", "Document IR has no main story"));
    return { diagnostics };
  }

  const paragraphs: MaterializedParagraph[] = [];
  const characterRuns: MaterializedCharacterRun[] = [];
  const texts: string[] = [];
  const blockById = new Map(document.blocks.map((block) => [block.id, block]));

  for (const blockId of storyIr.blockIds) {
    const block = blockById.get(blockId);
    if (!block) {
      diagnostics.push(fallbackError("Document.BlockMissing", "Story references unknown block " + blockId));
      continue;
    }
    const styleRole = storyIr.blockStyleRoles[blockId];
    const styleName = resolveStyleName(template, styleRole);
    if (styleRole && !styleName) {
      diagnostics.push(fallbackWarning("Template.StyleMissingForContent", "No template style resolves role " + styleRole + " for block " + blockId + "; InDesign defaults will be used."));
    }
    for (const paragraph of blockParagraphs(block, styleRole)) {
      const paragraphStyleName = paragraph.styleRole
        ? resolveStyleName(template, paragraph.styleRole)
        : undefined;
      if (paragraph.styleRole && !paragraphStyleName) {
        diagnostics.push(fallbackWarning("Template.StyleMissingForContent", "No template style resolves role " + paragraph.styleRole + " for block " + blockId + "; InDesign defaults will be used."));
      }
      const index = paragraphs.length;
      paragraphs.push({
        index,
        blockId,
        ...(paragraph.styleRole ? { styleRole: paragraph.styleRole } : {}),
        ...(paragraphStyleName ? { styleName: paragraphStyleName } : {}),
        text: paragraph.text
      });
      texts.push(paragraph.text);
      for (const run of paragraph.runs) {
        const runStyleName = resolveStyleName(template, run.styleRole);
        if (!runStyleName) {
          diagnostics.push(fallbackWarning("Template.StyleMissingForContent", "No template style resolves role " + run.styleRole + " for block " + blockId + "; text formatting was skipped."));
          continue;
        }
        characterRuns.push({
          paragraphIndex: index,
          blockId,
          start: run.start,
          end: run.end,
          styleRole: run.styleRole,
          styleName: runStyleName
        });
      }
    }
  }

  return {
    story: {
      storyId: storyIr.id,
      text: texts.join(paragraphSeparator),
      paragraphs,
      characterRuns
    },
    diagnostics
  };
}

export function planHostOperations(
  document: SemanticDocument,
  template: CompiledTemplate,
  ir: DocumentIR
): HostPlanResult {
  const materialized = materializeMainStory(document, template, ir);
  if (!materialized.story) return { diagnostics: materialized.diagnostics };

  const operations: HostOperation[] = [];
  for (const page of ir.pages) {
    operations.push({ op: "apply-parent-page", pageId: page.id, role: page.role, sourcePageRef: page.sourcePageRef });
    const articleFlowFrameRef = page.role === "Article" ? template.pageRoles.Article?.flowFrameRef : undefined;
    if (articleFlowFrameRef) {
      operations.push({ op: "adopt-parent-frame", pageId: page.id, frameRole: "article-flow" });
    }
  }

  const articlePageIds = ir.pages.filter((page) => page.role === "Article").map((page) => page.id);
  if (articlePageIds.length > 0) {
    operations.push({ op: "ensure-frame-threading", pageIds: articlePageIds, storyId: materialized.story.storyId });
  }

  operations.push({ op: "set-story-text", storyId: materialized.story.storyId, text: materialized.story.text });

  for (const paragraph of materialized.story.paragraphs) {
    if (paragraph.styleName) {
      operations.push({
        op: "apply-paragraph-style",
        storyId: materialized.story.storyId,
        paragraphIndex: paragraph.index,
        blockId: paragraph.blockId,
        styleName: paragraph.styleName
      });
    }
  }
  for (const run of materialized.story.characterRuns) {
    if (!run.styleName) continue;
    operations.push({
      op: "apply-character-style",
      storyId: materialized.story.storyId,
      paragraphIndex: run.paragraphIndex,
      start: run.start,
      end: run.end,
      blockId: run.blockId,
      styleName: run.styleName
    });
  }
  for (const placement of ir.assets) {
    const imageParagraph = materialized.story.paragraphs.find((paragraph) => paragraph.blockId === placement.blockId);
    if (!imageParagraph) continue;
    const objectStyleName = resolveStyleName(template, "InlineImage");
    operations.push({
      op: "place-inline-image",
      storyId: materialized.story.storyId,
      paragraphIndex: imageParagraph.index,
      blockId: placement.blockId,
      source: placement.source,
      alt: placement.alt,
      ...(objectStyleName ? { objectStyleName } : {})
    });
    operations.push({
      op: "place-image-placeholder",
      storyId: materialized.story.storyId,
      paragraphIndex: imageParagraph.index,
      blockId: placement.blockId,
      source: placement.source,
      alt: placement.alt
    });
  }

  return {
    plan: { schemaVersion: 1, operations, story: materialized.story },
    diagnostics: materialized.diagnostics
  };
}

interface BlockParagraph {
  text: string;
  runs: CharacterRun[];
  styleRole?: StyleRole;
}

type CharacterRun = { start: number; end: number; styleRole: "Emphasis" | "Link" | "Code" };

function blockParagraphs(block: SemanticBlock, blockStyleRole: StyleRole | undefined): BlockParagraph[] {
  if (block.type === "image") {
    // The image is anchored inline, so it needs a paragraph to live in; the
    // caption becomes its own Caption-styled paragraph when present.
    const anchor: BlockParagraph = { text: "", runs: [] };
    if (!block.caption || block.caption.length === 0) return [anchor];
    const caption = describeRuns(block.caption);
    return [anchor, { ...caption, styleRole: "Caption" }];
  }
  if (block.type === "divider") return [{ text: "", runs: [] }];
  const described = describeRuns(block.content);
  return [{ ...described, ...(blockStyleRole ? { styleRole: blockStyleRole } : {}) }];
}

function describeRuns(runs: Array<{ text: string; marks: string[] }>): BlockParagraph {
  let text = "";
  const described: BlockParagraph["runs"] = [];
  for (const run of runs) {
    const start = text.length;
    text += run.text;
    const end = text.length;
    const roles: Array<"Emphasis" | "Link" | "Code"> = [];
    if (run.marks.includes("strong") || run.marks.includes("emphasis")) roles.push("Emphasis");
    if (run.marks.includes("link")) roles.push("Link");
    if (run.marks.includes("code")) roles.push("Code");
    for (const styleRole of roles) described.push({ start, end, styleRole });
  }
  return { text, runs: described };
}

function resolveStyleName(template: CompiledTemplate, role: StyleRole | undefined): string | undefined {
  if (!role) return undefined;
  return template.styleRoles[role];
}

function fallbackError(code: string, message: string): Diagnostic {
  return { code, message, severity: "error" };
}

function fallbackWarning(code: string, message: string): Diagnostic {
  return { code, message, severity: "warning" };
}
