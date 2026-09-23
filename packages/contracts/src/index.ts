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
