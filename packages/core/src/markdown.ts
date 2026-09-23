import type {
  Diagnostic,
  SemanticBlock,
  SemanticDocument,
  TextRun
} from "@publisher/contracts";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";
import type { Content, PhrasingContent, Root } from "mdast";

export interface ParseArticleOptions {
  sourceId?: string;
}

export interface ParseArticleResult {
  document?: SemanticDocument;
  diagnostics: Diagnostic[];
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);

export function parseArticle(markdown: string, options: ParseArticleOptions = {}): ParseArticleResult {
  const diagnostics: Diagnostic[] = [];
  const normalized = markdown.replace(/\r\n?/g, "\n");
  let tree: Root;
  try {
    tree = parser.parse(normalized) as Root;
  } catch (error) {
    return {
      diagnostics: [{ code: "Article.ParseFailed", message: errorMessage(error), severity: "error" }]
    };
  }

  const metadata: Record<string, unknown> = {};
  const contentNodes: Content[] = [];
  for (const node of tree.children) {
    if (node.type === "yaml") {
      try {
        const parsed = parseYaml(node.value);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.assign(metadata, parsed);
        } else if (parsed !== null) {
          diagnostics.push({ code: "Article.InvalidFrontmatter", message: "Frontmatter must be a mapping", severity: "error" });
        }
      } catch (error) {
        diagnostics.push({ code: "Article.InvalidFrontmatter", message: errorMessage(error), severity: "error" });
      }
    } else {
      contentNodes.push(node);
    }
  }

  for (const key of Object.keys(metadata)) {
    if (!["title", "subtitle", "author", "language"].includes(key)) {
      diagnostics.push({ code: "Article.UnknownMetadata", message: `Unsupported metadata field: ${key}`, severity: "warning", path: `metadata.${key}` });
    }
  }

  let title = typeof metadata.title === "string" ? metadata.title.trim() : "";
  let titleHeadingIndex = -1;
  if (title) {
    const firstH1 = contentNodes.findIndex((node) => node.type === "heading" && node.depth === 1);
    if (firstH1 >= 0) {
      const headingText = plainText((contentNodes[firstH1] as Extract<Content, { type: "heading" }>).children);
      if (headingText.trim() === title) titleHeadingIndex = firstH1;
      else diagnostics.push({ code: "Article.TitleMismatch", message: "The first level-one heading must match frontmatter title", severity: "error", path: `blocks.${firstH1}` });
    }
  } else {
    titleHeadingIndex = contentNodes.findIndex((node) => node.type === "heading" && node.depth === 1);
    if (titleHeadingIndex >= 0) {
      title = plainText((contentNodes[titleHeadingIndex] as Extract<Content, { type: "heading" }>).children).trim();
    }
  }
  if (!title) diagnostics.push({ code: "Article.TitleMissing", message: "Provide a title in frontmatter or as the first level-one heading", severity: "error" });

  const blocks: SemanticBlock[] = [];
  const idCounts = new Map<string, number>();
  contentNodes.forEach((node, index) => {
    if (index === titleHeadingIndex) return;
    const converted = convertBlock(node, index, idCounts, diagnostics);
    if (converted) blocks.push(converted);
  });

  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics };
  const titleText = title || "Untitled";
  const subtitle = stringField(metadata.subtitle);
  const author = stringField(metadata.author);
  const language = stringField(metadata.language);
  const document: SemanticDocument = {
    schemaVersion: 1,
    id: `article-${hashText(options.sourceId?.trim() || titleText)}`,
    metadata: {
      title: titleText,
      ...(subtitle ? { subtitle } : {}),
      ...(author ? { author } : {}),
      ...(language ? { language } : {})
    },
    blocks
  };
  return { document, diagnostics };
}

function convertBlock(
  node: Content,
  index: number,
  idCounts: Map<string, number>,
  diagnostics: Diagnostic[]
): SemanticBlock | undefined {
  if (node.type === "heading") {
    const content = phrasingRuns(node.children, diagnostics, `blocks.${index}`);
    return { id: blockId("heading", runsText(content), idCounts), type: "heading", level: Math.min(node.depth, 3) as 1 | 2 | 3, content };
  }
  if (node.type === "paragraph") {
    const image = node.children.length === 1 && node.children[0]?.type === "image" ? node.children[0] : undefined;
    if (image) {
      return {
        id: blockId("image", `${image.url}\n${image.alt ?? ""}\n${image.title ?? ""}`, idCounts),
        type: "image",
        src: image.url,
        alt: image.alt ?? "",
        ...(image.title ? { caption: [{ text: image.title, marks: [] }] } : {})
      };
    }
    if (node.children.some((child) => child.type === "image")) {
      diagnostics.push({ code: "Article.InlineImageUnsupported", message: "Images must be a standalone paragraph in v1", severity: "error", path: `blocks.${index}` });
      return undefined;
    }
    const content = phrasingRuns(node.children, diagnostics, `blocks.${index}`);
    return { id: blockId("paragraph", runsText(content), idCounts), type: "paragraph", content };
  }
  if (node.type === "blockquote") {
    const paragraphs = node.children.filter((child) => child.type === "paragraph");
    if (paragraphs.length !== node.children.length || paragraphs.length !== 1) {
      diagnostics.push({ code: "Article.QuoteShapeUnsupported", message: "A quote must contain exactly one paragraph in v1", severity: "error", path: `blocks.${index}` });
      return undefined;
    }
    const content = phrasingRuns(paragraphs[0]!.children, diagnostics, `blocks.${index}`);
    return { id: blockId("quote", runsText(content), idCounts), type: "quote", content };
  }
  if (node.type === "thematicBreak") return { id: blockId("divider", String(index), idCounts), type: "divider" };
  diagnostics.push({ code: "Article.BlockUnsupported", message: `Unsupported Markdown block: ${node.type}`, severity: "error", path: `blocks.${index}` });
  return undefined;
}

function phrasingRuns(nodes: PhrasingContent[], diagnostics: Diagnostic[], path: string): TextRun[] {
  const runs: TextRun[] = [];
  const append = (text: string, marks: TextRun["marks"], href?: string): void => {
    if (!text) return;
    const last = runs.at(-1);
    if (last && sameMarks(last.marks, marks) && last.href === href) last.text += text;
    else runs.push({ text, marks, ...(href ? { href } : {}) });
  };
  const walk = (node: PhrasingContent, marks: TextRun["marks"] = []): void => {
    if (node.type === "text") append(node.value, marks);
    else if (node.type === "inlineCode") append(node.value, [...marks, "code"]);
    else if (node.type === "strong" || node.type === "emphasis") {
      const mark = node.type === "strong" ? "strong" : "emphasis";
      for (const child of node.children) walk(child, [...marks, mark]);
    } else if (node.type === "link" || node.type === "linkReference") {
      const href = node.type === "link" ? node.url : node.identifier;
      for (const child of node.children) {
        if (child.type === "text") append(child.value, [...marks, "link"], href);
        else walk(child, [...marks, "link"]);
      }
    } else if (node.type === "break") append("\n", marks);
    else if (node.type === "image" || node.type === "imageReference") {
      diagnostics.push({ code: "Article.InlineImageUnsupported", message: "Inline images are unsupported in v1", severity: "error", path });
    } else if ("children" in node) {
      for (const child of node.children) walk(child as PhrasingContent, marks);
    }
  };
  for (const node of nodes) walk(node);
  return runs;
}

function plainText(nodes: PhrasingContent[]): string {
  return nodes.map((node) => {
    if (node.type === "text" || node.type === "inlineCode") return node.value;
    if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
    if ("children" in node) return plainText(node.children as PhrasingContent[]);
    return "";
  }).join("");
}

function runsText(runs: TextRun[]): string {
  return runs.map((run) => run.text).join("");
}

function blockId(type: string, identity: string, counts: Map<string, number>): string {
  const base = `${type}-${hashText(identity)}`;
  const occurrence = counts.get(base) ?? 0;
  counts.set(base, occurrence + 1);
  return occurrence ? `${base}-${occurrence + 1}` : base;
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sameMarks(left: TextRun["marks"], right: TextRun["marks"]): boolean {
  return left.length === right.length && left.every((mark, index) => mark === right[index]);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
