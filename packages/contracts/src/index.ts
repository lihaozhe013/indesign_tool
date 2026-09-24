export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  path?: string;
  context?: Record<string, string | number | boolean>;
}

export interface TextRun {
  text: string;
  marks: Array<"strong" | "emphasis" | "code" | "link">;
  href?: string;
}

export interface ArticleMetadata {
  title: string;
  subtitle?: string;
  author?: string;
  language?: string;
}

export interface BlockBase {
  id: string;
}

export interface HeadingBlock extends BlockBase {
  type: "heading";
  level: 1 | 2 | 3;
  content: TextRun[];
}

export interface ParagraphBlock extends BlockBase {
  type: "paragraph";
  content: TextRun[];
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  content: TextRun[];
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  caption?: TextRun[];
}

export interface DividerBlock extends BlockBase {
  type: "divider";
}

export type SemanticBlock =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | ImageBlock
  | DividerBlock;

export interface SemanticDocument {
  schemaVersion: 1;
  id: string;
  metadata: ArticleMetadata;
  blocks: SemanticBlock[];
}

export type PageRole = "Cover" | "Article" | "Ending" | "ImageFeature";
export type StyleRole =
  | "ArticleTitle"
  | "Subtitle"
  | "SectionHeading"
  | "Subheading"
  | "Body"
  | "Quote"
  | "Caption"
  | "Emphasis"
  | "Link"
  | "Code"
  | "InlineImage"
  | "HeroImage";
export type StyleKind = "paragraph" | "character" | "object";

export interface TemplateStyle {
  kind: StyleKind;
  name: string;
  qualifiedName: string;
  role?: StyleRole;
}

export interface TemplatePage {
  ref: string;
  name: string;
  source: "page" | "parentPage";
  role?: PageRole;
}

export interface TemplateFrame {
  ref: string;
  pageRef: string;
  name: string;
  role: string;
  kind: "text" | "graphic";
}

export interface TemplateInventory {
  schemaVersion: 1;
  templateId: string;
  name: string;
  hostVersion?: string;
  pages: TemplatePage[];
  frames: TemplateFrame[];
  styles: TemplateStyle[];
  requiredAssets: string[];
}

export interface TemplateScanPage {
  ref: string;
  index: number;
  name: string;
  label?: string;
  roleLabel?: string;
  appliedParentPageRef?: string;
  bounds?: [number, number, number, number];
}

export interface TemplateScanFrame {
  ref: string;
  index: number;
  name: string;
  kind: "text" | "graphic" | "other";
  label?: string;
  roleLabel?: string;
  pageRef?: string;
  parentPageRef?: string;
  layerName?: string;
  bounds?: [number, number, number, number];
  storyRef?: string;
  previousFrameRef?: string;
  nextFrameRef?: string;
  textLength?: number;
  overset?: boolean;
  wrapMode?: string;
}

export interface TemplateScanStory {
  ref: string;
  index: number;
  textLength: number;
  overset: boolean;
  frameRefs: string[];
}

export interface TemplateScanStyle {
  ref: string;
  index: number;
  kind: StyleKind;
  name: string;
  qualifiedName: string;
  roleLabel?: string;
}

export interface TemplateScanAsset {
  ref: string;
  name: string;
  format: string;
  status: string;
}

export interface TemplateScanFont {
  name: string;
  family: string;
  style: string;
  status: string;
}

export interface TemplateScan {
  schemaVersion: 1;
  host: {
    application: "InDesign";
    version: string;
    domVersion: string;
  };
  document: {
    name: string;
    modified: boolean;
    horizontalMeasurementUnits: string;
    verticalMeasurementUnits: string;
    pageCount: number;
    spreadCount: number;
    parentPageCount: number;
    storyCount: number;
  };
  pages: TemplateScanPage[];
  parentPages: TemplateScanPage[];
  frames: TemplateScanFrame[];
  stories: TemplateScanStory[];
  styles: TemplateScanStyle[];
  assets: TemplateScanAsset[];
  fonts: TemplateScanFont[];
}

export interface TemplateRoleAssignments {
  schemaVersion: 1;
  templateId: string;
  name: string;
  pageRoles: Array<{ ref: string; role: PageRole }>;
  frameRoles: Array<{ ref: string; role: string }>;
  styleRoles: Array<{ ref: string; role: StyleRole }>;
  requiredAssets: string[];
}

export interface CompiledPageRole {
  sourcePageRef: string;
  flowFrameRef?: string;
}

export interface CompiledTemplate {
  schemaVersion: 1;
  templateId: string;
  name: string;
  pageRoles: Partial<Record<PageRole, CompiledPageRole>>;
  frameRoles: Record<string, string>;
  styleRoles: Partial<Record<StyleRole, string>>;
  requiredAssets: string[];
}

export interface DocumentPageIR {
  id: string;
  role: PageRole;
  sourcePageRef: string;
  stories: string[];
  titleStyleRole?: StyleRole;
  subtitleStyleRole?: StyleRole;
}

export interface DocumentStoryIR {
  id: string;
  blockIds: string[];
  blockStyleRoles: Record<string, StyleRole>;
  captionStyleRoles: string[];
  characterStyleRoles: Array<{ blockId: string; runIndex: number; styleRole: "Emphasis" | "Link" | "Code" }>;
}

export interface DocumentIR {
  schemaVersion: 1;
  articleId: string;
  templateId: string;
  pages: DocumentPageIR[];
  stories: Record<string, DocumentStoryIR>;
  assets: Array<{ blockId: string; source: string; alt: string }>;
}

export interface HostOverset {
  storyId: string;
  pageId: string;
  frameRef: string;
  remainingCharacters?: number;
}

export interface HostObservation {
  pageCount: number;
  overset: HostOverset[];
  missingAssets: string[];
  missingFonts: string[];
}

export interface HostJob {
  schemaVersion: 1;
  jobId: string;
  action: "inspectTemplate" | "render" | "dump" | "export" | "probe";
  payload: Record<string, unknown>;
}

export interface HostJobResult {
  schemaVersion: 1;
  jobId: string;
  status: "succeeded" | "failed";
  diagnostics: Diagnostic[];
  payload?: Record<string, unknown>;
}

export interface HostJobQueue {
  listPending(): Promise<HostJob[]>;
  writeResult(result: HostJobResult): Promise<void>;
  removePending(jobId: string): Promise<void>;
}

export type HostJobHandler = (job: HostJob) => Promise<Record<string, unknown>>;

export interface HostAdapter {
  inspectTemplate(templatePath: string): Promise<TemplateInventory>;
  render(input: {
    templatePath: string;
    outputPath: string;
    document: SemanticDocument;
    template: CompiledTemplate;
    ir: DocumentIR;
    mode: "create" | "appendPages";
  }): Promise<HostObservation>;
  dump(documentPath: string): Promise<DocumentDump>;
  export(documentPath: string, outputPath: string, format: "pdf" | "png" | "jpeg"): Promise<void>;
}

export interface DocumentDump {
  schemaVersion: 1;
  pages: Array<{
    id: string;
    role?: PageRole;
    index: number;
    parentPage?: string;
  }>;
  stories: Array<{
    id: string;
    overset: boolean;
    paragraphs: Array<{ semanticId?: string; style?: string; text: string }>;
  }>;
  frames: Array<{
    semanticRole?: string;
    pageIndex?: number;
    bounds?: [number, number, number, number];
    previousFrame?: string;
    nextFrame?: string;
  }>;
  missingAssets: string[];
  missingFonts: string[];
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, sortJson(record[key])])
    );
  }
  return value;
}

export function validateVersionedObject(value: unknown, schemaName: string): Diagnostic[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ code: "Schema.InvalidRoot", message: `${schemaName} must be an object`, severity: "error" }];
  }
  const version = (value as Record<string, unknown>).schemaVersion;
  if (version !== 1) {
    return [{
      code: "Schema.UnsupportedVersion",
      message: `${schemaName} schemaVersion must be 1`,
      severity: "error",
      context: { actual: String(version ?? "missing") }
    }];
  }
  return [];
}

export function validateSemanticDocument(value: unknown): Diagnostic[] {
  const diagnostics = [...validateVersionedObject(value, "SemanticDocument")];
  if (!isRecord(value)) return diagnostics;
  if (!isNonEmptyString(value.id)) diagnostics.push(schemaError("SemanticDocument.id", "id must be a non-empty string"));
  if (!isRecord(value.metadata) || !isNonEmptyString(value.metadata.title)) {
    diagnostics.push(schemaError("SemanticDocument.metadata.title", "metadata.title must be a non-empty string"));
  } else {
    for (const field of ["subtitle", "author", "language"]) {
      if (value.metadata[field] !== undefined && typeof value.metadata[field] !== "string") {
        diagnostics.push(schemaError("SemanticDocument.metadata." + field, field + " must be a string when provided"));
      }
    }
  }
  if (!Array.isArray(value.blocks)) {
    diagnostics.push(schemaError("SemanticDocument.blocks", "blocks must be an array"));
    return diagnostics;
  }
  const ids = new Set<string>();
  value.blocks.forEach((block, index) => {
    const path = "blocks." + index;
    if (!isRecord(block) || !isNonEmptyString(block.id) || !isNonEmptyString(block.type)) {
      diagnostics.push(schemaError(path, "Each block needs a string id and type"));
      return;
    }
    if (ids.has(block.id)) diagnostics.push(schemaError(path + ".id", "Block ids must be unique"));
    ids.add(block.id);
    if (block.type === "image") {
      if (typeof block.src !== "string" || typeof block.alt !== "string") diagnostics.push(schemaError(path, "Image blocks need string src and alt fields"));
      if (block.caption !== undefined) validateRuns(block.caption, path + ".caption", diagnostics);
    } else if (block.type === "divider") {
      return;
    } else if (block.type === "heading") {
      if (![1, 2, 3].includes(Number(block.level))) diagnostics.push(schemaError(path + ".level", "Heading level must be 1, 2, or 3"));
      validateRuns(block.content, path + ".content", diagnostics);
    } else if (["paragraph", "quote"].includes(String(block.type))) {
      validateRuns(block.content, path + ".content", diagnostics);
    } else {
      diagnostics.push(schemaError(path + ".type", "Unsupported block type: " + String(block.type)));
    }
  });
  return diagnostics;
}

export function validateTemplateInventory(value: unknown): Diagnostic[] {
  const diagnostics = [...validateVersionedObject(value, "TemplateInventory")];
  if (!isRecord(value)) return diagnostics;
  if (!isNonEmptyString(value.templateId) || !isNonEmptyString(value.name)) {
    diagnostics.push(schemaError("templateId", "templateId and name must be non-empty strings"));
  }
  for (const field of ["pages", "frames", "styles", "requiredAssets"]) {
    if (!Array.isArray(value[field])) diagnostics.push(schemaError(field, field + " must be an array"));
  }
  if (!Array.isArray(value.pages) || !Array.isArray(value.frames) || !Array.isArray(value.styles) || !Array.isArray(value.requiredAssets)) return diagnostics;
  value.pages.forEach((page, index) => {
    if (!isRecord(page) || !isNonEmptyString(page.ref) || !isNonEmptyString(page.name) || !["page", "parentPage"].includes(String(page.source))) {
      diagnostics.push(schemaError("pages." + index, "Invalid template page"));
    } else if (page.role !== undefined && !["Cover", "Article", "Ending", "ImageFeature"].includes(String(page.role))) {
      diagnostics.push(schemaError("pages." + index + ".role", "Unsupported page role"));
    }
  });
  value.frames.forEach((frame, index) => {
    if (!isRecord(frame) || !isNonEmptyString(frame.ref) || !isNonEmptyString(frame.pageRef) || !isNonEmptyString(frame.name) || !isNonEmptyString(frame.role) || !["text", "graphic"].includes(String(frame.kind))) {
      diagnostics.push(schemaError("frames." + index, "Invalid template frame"));
    }
  });
  value.styles.forEach((style, index) => {
    if (!isRecord(style) || !isNonEmptyString(style.name) || !isNonEmptyString(style.qualifiedName) || !["paragraph", "character", "object"].includes(String(style.kind))) {
      diagnostics.push(schemaError("styles." + index, "Invalid template style"));
    } else if (style.role !== undefined && !["ArticleTitle", "Subtitle", "SectionHeading", "Subheading", "Body", "Quote", "Caption", "Emphasis", "Link", "Code", "InlineImage", "HeroImage"].includes(String(style.role))) {
      diagnostics.push(schemaError("styles." + index + ".role", "Unsupported style role"));
    }
  });
  value.requiredAssets.forEach((asset, index) => {
    if (!isNonEmptyString(asset)) diagnostics.push(schemaError("requiredAssets." + index, "Required asset paths must be non-empty strings"));
  });
  return diagnostics;
}

export function validateTemplateScan(value: unknown): Diagnostic[] {
  const diagnostics = [...validateVersionedObject(value, "TemplateScan")];
  if (!isRecord(value)) return diagnostics;
  if (!isRecord(value.host)
      || value.host.application !== "InDesign"
      || !isNonEmptyString(value.host.version)
      || !isNonEmptyString(value.host.domVersion)) {
    diagnostics.push(schemaError("host", "TemplateScan needs InDesign host and DOM versions"));
  }
  const document = isRecord(value.document) ? value.document : null;
  if (!document
      || !isNonEmptyString(document.name)
      || typeof document.modified !== "boolean"
      || !isNonEmptyString(document.horizontalMeasurementUnits)
      || !isNonEmptyString(document.verticalMeasurementUnits)
      || !["pageCount", "spreadCount", "parentPageCount", "storyCount"].every((field) =>
        Number.isInteger(document[field]) && Number(document[field]) >= 0)) {
    diagnostics.push(schemaError("document", "TemplateScan document metadata is invalid"));
  }
  const arrayFields = ["pages", "parentPages", "frames", "stories", "styles", "assets", "fonts"];
  const arrays: Record<string, unknown[]> = {};
  for (const field of arrayFields) {
    if (Array.isArray(value[field])) arrays[field] = value[field];
    else diagnostics.push(schemaError(field, field + " must be an array"));
  }
  if (arrayFields.some((field) => arrays[field] === undefined)) return diagnostics;

  const pageRefs = new Set<string>();
  const parentPageRefs = new Set<string>();
  for (const field of ["pages", "parentPages"] as const) {
    const refs = field === "pages" ? pageRefs : parentPageRefs;
    arrays[field]!.forEach((page, index) => {
      const path = field + "." + index;
      if (!isRecord(page) || !isNonEmptyString(page.ref) || !Number.isInteger(page.index)
          || !isNonEmptyString(page.name) || (page.label !== undefined && typeof page.label !== "string")
          || (page.roleLabel !== undefined && typeof page.roleLabel !== "string")
          || (page.appliedParentPageRef !== undefined && typeof page.appliedParentPageRef !== "string")
          || (page.bounds !== undefined && !isBounds(page.bounds))) {
        diagnostics.push(schemaError(path, "Invalid scanned page"));
      } else if (refs.has(page.ref)) {
        diagnostics.push(schemaError(path + ".ref", "Duplicate scanned page reference"));
      } else {
        refs.add(page.ref);
      }
    });
  }

  const frameRefs = new Set<string>();
  arrays.frames!.forEach((frame, index) => {
    const path = "frames." + index;
    if (!isRecord(frame) || !isNonEmptyString(frame.ref) || !Number.isInteger(frame.index)
        || !isNonEmptyString(frame.name) || !["text", "graphic", "other"].includes(String(frame.kind))
        || (frame.label !== undefined && typeof frame.label !== "string")
        || (frame.roleLabel !== undefined && typeof frame.roleLabel !== "string")
        || (frame.pageRef !== undefined && typeof frame.pageRef !== "string")
        || (frame.parentPageRef !== undefined && typeof frame.parentPageRef !== "string")
        || (frame.layerName !== undefined && typeof frame.layerName !== "string")
        || (frame.bounds !== undefined && !isBounds(frame.bounds))
        || (frame.storyRef !== undefined && typeof frame.storyRef !== "string")
        || (frame.previousFrameRef !== undefined && typeof frame.previousFrameRef !== "string")
        || (frame.nextFrameRef !== undefined && typeof frame.nextFrameRef !== "string")
        || (frame.textLength !== undefined && (!Number.isInteger(frame.textLength) || Number(frame.textLength) < 0))
        || (frame.overset !== undefined && typeof frame.overset !== "boolean")
        || (frame.wrapMode !== undefined && typeof frame.wrapMode !== "string")) {
      diagnostics.push(schemaError(path, "Invalid scanned frame"));
    } else if (frameRefs.has(frame.ref)) {
      diagnostics.push(schemaError(path + ".ref", "Duplicate scanned frame reference"));
    } else {
      frameRefs.add(frame.ref);
    }
  });

  const storyRefs = new Set<string>();
  const storyFrameRefsByRef = new Map<string, Set<string>>();
  arrays.stories!.forEach((story, index) => {
    if (!isRecord(story) || !isNonEmptyString(story.ref) || !Number.isInteger(story.index)
        || !Number.isInteger(story.textLength) || Number(story.textLength) < 0
        || typeof story.overset !== "boolean" || !Array.isArray(story.frameRefs)
        || !story.frameRefs.every((ref) => typeof ref === "string")) {
      diagnostics.push(schemaError("stories." + index, "Invalid scanned story"));
    } else if (storyRefs.has(story.ref)) {
      diagnostics.push(schemaError("stories." + index + ".ref", "Duplicate scanned story reference"));
    } else {
      storyRefs.add(story.ref);
      const frameRefsForStory = story.frameRefs as string[];
      storyFrameRefsByRef.set(story.ref, new Set(frameRefsForStory));
      if (new Set(frameRefsForStory).size !== frameRefsForStory.length) {
        diagnostics.push(schemaError("stories." + index + ".frameRefs", "Story frame references must be unique"));
      }
    }
  });
  const frameByRef = new Map(arrays.frames!
    .filter((frame): frame is Record<string, unknown> => isRecord(frame) && isNonEmptyString(frame.ref))
    .map((frame) => [String(frame.ref), frame]));
  arrays.stories!.forEach((story, index) => {
    if (!isRecord(story) || !Array.isArray(story.frameRefs)) return;
    story.frameRefs.forEach((ref, frameIndex) => {
      if (typeof ref === "string" && !frameRefs.has(ref)) {
        diagnostics.push(schemaError("stories." + index + ".frameRefs." + frameIndex, "Story references an unknown frame"));
      } else if (typeof ref === "string" && frameByRef.get(ref)?.storyRef !== story.ref) {
        diagnostics.push(schemaError("stories." + index + ".frameRefs." + frameIndex, "Frame belongs to a different story"));
      }
    });
  });
  arrays.frames!.forEach((frame, index) => {
    if (!isRecord(frame)) return;
    if (typeof frame.pageRef === "string" && !pageRefs.has(frame.pageRef)) {
      diagnostics.push(schemaError("frames." + index + ".pageRef", "Frame references an unknown page"));
    }
    if (typeof frame.parentPageRef === "string" && !parentPageRefs.has(frame.parentPageRef)) {
      diagnostics.push(schemaError("frames." + index + ".parentPageRef", "Frame references an unknown parent page"));
    }
    if (typeof frame.storyRef === "string" && !storyRefs.has(frame.storyRef)) {
      diagnostics.push(schemaError("frames." + index + ".storyRef", "Frame references an unknown story"));
    } else if (typeof frame.storyRef === "string" && !storyFrameRefsByRef.get(frame.storyRef)?.has(String(frame.ref))) {
      diagnostics.push(schemaError("frames." + index + ".storyRef", "Story frame list does not contain this frame"));
    }
    for (const field of ["previousFrameRef", "nextFrameRef"] as const) {
      if (typeof frame[field] === "string" && !frameRefs.has(frame[field])) {
        diagnostics.push(schemaError("frames." + index + "." + field, "Frame references an unknown text frame"));
      }
    }
  });
  arrays.pages!.forEach((page, index) => {
    if (isRecord(page) && typeof page.appliedParentPageRef === "string" && !parentPageRefs.has(page.appliedParentPageRef)) {
      diagnostics.push(schemaError("pages." + index + ".appliedParentPageRef", "Page references an unknown parent page"));
    }
  });
  const styleRefs = new Set<string>();
  arrays.styles!.forEach((style, index) => {
    if (!isRecord(style) || !isNonEmptyString(style.ref) || !Number.isInteger(style.index)
        || !["paragraph", "character", "object"].includes(String(style.kind))
        || !isNonEmptyString(style.name) || !isNonEmptyString(style.qualifiedName)
        || (style.roleLabel !== undefined && typeof style.roleLabel !== "string")) {
      diagnostics.push(schemaError("styles." + index, "Invalid scanned style"));
    } else if (styleRefs.has(style.ref)) {
      diagnostics.push(schemaError("styles." + index + ".ref", "Duplicate scanned style reference"));
    } else {
      styleRefs.add(style.ref);
    }
  });
  const assetRefs = new Set<string>();
  arrays.assets!.forEach((asset, index) => {
    if (!isRecord(asset) || !isNonEmptyString(asset.ref) || !isNonEmptyString(asset.name)
        || !isNonEmptyString(asset.format) || !isNonEmptyString(asset.status)) {
      diagnostics.push(schemaError("assets." + index, "Invalid scanned asset"));
    } else if (assetRefs.has(asset.ref)) {
      diagnostics.push(schemaError("assets." + index + ".ref", "Duplicate scanned asset reference"));
    } else {
      assetRefs.add(asset.ref);
    }
  });
  arrays.fonts!.forEach((font, index) => {
    if (!isRecord(font) || !isNonEmptyString(font.name) || !isNonEmptyString(font.family)
        || !isNonEmptyString(font.style) || !isNonEmptyString(font.status)) {
      diagnostics.push(schemaError("fonts." + index, "Invalid scanned font"));
    }
  });
  if (document) {
    const expectedCounts: Array<[string, string]> = [
      ["pageCount", "pages"],
      ["parentPageCount", "parentPages"],
      ["storyCount", "stories"]
    ];
    for (const [countField, arrayField] of expectedCounts) {
      if (Number.isInteger(document[countField]) && Array.isArray(value[arrayField])
          && document[countField] !== value[arrayField].length) {
        diagnostics.push(schemaError("document." + countField, countField + " does not match " + arrayField + " length"));
      }
    }
  }
  return diagnostics;
}

export function validateTemplateRoleAssignments(value: unknown): Diagnostic[] {
  const diagnostics = [...validateVersionedObject(value, "TemplateRoleAssignments")];
  if (!isRecord(value)) return diagnostics;
  if (!isNonEmptyString(value.templateId) || !isNonEmptyString(value.name)) {
    diagnostics.push(schemaError("templateId", "templateId and name must be non-empty strings"));
  }
  const fields = ["pageRoles", "frameRoles", "styleRoles", "requiredAssets"];
  const arrays: Record<string, unknown[]> = {};
  for (const field of fields) {
    if (Array.isArray(value[field])) arrays[field] = value[field];
    else diagnostics.push(schemaError(field, field + " must be an array"));
  }
  if (fields.some((field) => arrays[field] === undefined)) return diagnostics;
  const seen = new Set<string>();
  const assignmentSets: Array<[string, string[] | undefined]> = [
    ["pageRoles", ["Cover", "Article", "Ending", "ImageFeature"]],
    ["frameRoles", undefined],
    ["styleRoles", ["ArticleTitle", "Subtitle", "SectionHeading", "Subheading", "Body", "Quote", "Caption", "Emphasis", "Link", "Code", "InlineImage", "HeroImage"]]
  ];
  for (const [field, allowedRoles] of assignmentSets) {
    arrays[field]!.forEach((assignment, index) => {
      if (!isRecord(assignment) || !isNonEmptyString(assignment.ref) || !isNonEmptyString(assignment.role)
          || (allowedRoles && !allowedRoles.includes(String(assignment.role)))) {
        diagnostics.push(schemaError(field + "." + index, "Invalid semantic role assignment"));
      } else {
        const key = field.slice(0, -1) + ":" + assignment.ref;
        if (seen.has(key)) diagnostics.push(schemaError(field + "." + index + ".ref", "An object has multiple role assignments"));
        seen.add(key);
      }
    });
  }
  arrays.requiredAssets!.forEach((asset, index) => {
    if (!isNonEmptyString(asset)) diagnostics.push(schemaError("requiredAssets." + index, "Required asset names must be non-empty strings"));
  });
  return diagnostics;
}

function validateRuns(value: unknown, path: string, diagnostics: Diagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push(schemaError(path, "Text content must be an array of runs"));
    return;
  }
  value.forEach((run, index) => {
    if (!isRecord(run) || typeof run.text !== "string" || !Array.isArray(run.marks) || !run.marks.every((mark) => ["strong", "emphasis", "code", "link"].includes(String(mark))) || (run.href !== undefined && typeof run.href !== "string")) {
      diagnostics.push(schemaError(path + "." + index, "Invalid text run"));
    }
  });
}

function schemaError(path: string, message: string): Diagnostic {
  return { code: "Schema.InvalidValue", message, severity: "error", path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBounds(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}
