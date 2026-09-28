import type { Diagnostic, SemanticBlock, SemanticDocument, TextRun } from '@folio/contracts';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';
import type { Content, PhrasingContent, Root } from 'mdast';

export interface ParseArticleOptions {
  sourceId?: string;
  fallbackTitle?: string;
}

export interface ParseArticleResult {
  document?: SemanticDocument;
  diagnostics: Diagnostic[];
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);

export function parseArticle(
  markdown: string,
  options: ParseArticleOptions = {}
): ParseArticleResult {
  const diagnostics: Diagnostic[] = [];
  const normalized = markdown.replace(/\r\n?/g, '\n');
  let tree: Root;
  try {
    tree = parser.parse(normalized) as Root;
  } catch (error) {
    return {
      document: fallbackDocument(normalized, options),
      diagnostics: [
        { code: 'Article.ParseFailed', message: errorMessage(error), severity: 'warning' }
      ]
    };
  }

  const metadata: Record<string, unknown> = {};
  const contentNodes: Content[] = [];
  for (const node of tree.children) {
    if (node.type === 'yaml') {
      try {
        const parsed = parseYaml(node.value);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(metadata, parsed);
        } else if (parsed !== null) {
          diagnostics.push({
            code: 'Article.InvalidFrontmatter',
            message: 'Frontmatter must be a mapping; it was ignored.',
            severity: 'warning'
          });
        }
      } catch (error) {
        diagnostics.push({
          code: 'Article.InvalidFrontmatter',
          message: errorMessage(error),
          severity: 'warning'
        });
      }
    } else {
      contentNodes.push(node);
    }
  }

  for (const key of Object.keys(metadata)) {
    if (!['title', 'subtitle', 'author', 'language'].includes(key)) {
      diagnostics.push({
        code: 'Article.UnknownMetadata',
        message: `Unsupported metadata field: ${key}`,
        severity: 'warning',
        path: `metadata.${key}`
      });
    }
  }

  let title = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  let titleHeadingIndex = -1;
  if (title) {
    const firstH1 = contentNodes.findIndex((node) => node.type === 'heading' && node.depth === 1);
    if (firstH1 >= 0) {
      const headingText = plainText(
        (contentNodes[firstH1] as Extract<Content, { type: 'heading' }>).children
      );
      if (headingText.trim() === title) titleHeadingIndex = firstH1;
      else
        diagnostics.push({
          code: 'Article.TitleMismatch',
          message:
            'The frontmatter title is used on the cover; the different level-one heading remains in the article.',
          severity: 'warning',
          path: `blocks.${firstH1}`
        });
    }
  } else {
    titleHeadingIndex = contentNodes.findIndex(
      (node) => node.type === 'heading' && node.depth === 1
    );
    if (titleHeadingIndex >= 0) {
      title = plainText(
        (contentNodes[titleHeadingIndex] as Extract<Content, { type: 'heading' }>).children
      ).trim();
    }
  }
  if (!title) {
    title = fallbackTitle(options);
    diagnostics.push({
      code: 'Article.TitleMissing',
      message: 'No title was found; Folio used a fallback title.',
      severity: 'warning'
    });
  }

  const blocks: SemanticBlock[] = [];
  const idCounts = new Map<string, number>();
  contentNodes.forEach((node, index) => {
    if (index === titleHeadingIndex) return;
    const converted = convertBlock(node, index, idCounts, diagnostics);
    blocks.push(...converted);
  });

  const titleText = title || fallbackTitle(options);
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
): SemanticBlock[] {
  if (node.type === 'heading') {
    const content = phrasingRuns(node.children, diagnostics, `blocks.${index}`);
    return [
      {
        id: blockId('heading', runsText(content), idCounts),
        type: 'heading',
        level: Math.min(node.depth, 3) as 1 | 2 | 3,
        content
      }
    ];
  }
  if (node.type === 'paragraph') {
    return convertParagraph(node.children, index, idCounts, diagnostics);
  }
  if (node.type === 'blockquote') {
    const paragraphs = node.children.filter((child) => child.type === 'paragraph');
    if (paragraphs.length !== node.children.length) {
      diagnostics.push({
        code: 'Article.QuoteShapeUnsupported',
        message: 'Non-paragraph quote content was converted to plain text.',
        severity: 'warning',
        path: `blocks.${index}`
      });
    }
    const contentNodes = paragraphs.length ? paragraphs : [node.children[0]];
    return contentNodes.flatMap((paragraph) => {
      if (!paragraph) return [];
      const text =
        paragraph.type === 'paragraph'
          ? phrasingRuns(paragraph.children, diagnostics, `blocks.${index}`)
          : [{ text: plainTextNode(paragraph), marks: [] as TextRun['marks'] }];
      return [
        { id: blockId('quote', runsText(text), idCounts), type: 'quote' as const, content: text }
      ];
    });
  }
  if (node.type === 'thematicBreak')
    return [{ id: blockId('divider', String(index), idCounts), type: 'divider' }];
  if (node.type === 'list') {
    diagnostics.push({
      code: 'Article.ListFlattened',
      message: 'List formatting was converted to text.',
      severity: 'warning',
      path: `blocks.${index}`
    });
    const blocks = node.children.flatMap((item, itemIndex) => {
      const prefix = node.ordered ? `${(node.start ?? 1) + itemIndex}. ` : '• ';
      const value = item.children.map(plainTextNode).filter(Boolean).join(' ');
      if (!value) return [];
      const content = [{ text: prefix + value, marks: [] as TextRun['marks'] }];
      return [
        {
          id: blockId('paragraph', runsText(content), idCounts),
          type: 'paragraph' as const,
          content
        }
      ];
    });
    return blocks;
  }
  if (node.type === 'table') {
    diagnostics.push({
      code: 'Article.TableFlattened',
      message: 'Table rows were converted to text separated by vertical bars.',
      severity: 'warning',
      path: `blocks.${index}`
    });
    return node.children.map((row) => {
      const content = [
        { text: row.children.map(plainTextNode).join(' | '), marks: [] as TextRun['marks'] }
      ];
      return {
        id: blockId('paragraph', runsText(content), idCounts),
        type: 'paragraph' as const,
        content
      };
    });
  }
  if (node.type === 'code') {
    diagnostics.push({
      code: 'Article.CodeBlockFlattened',
      message: 'Code block formatting was removed; code text was preserved.',
      severity: 'warning',
      path: `blocks.${index}`
    });
    const content = [{ text: node.value, marks: [] as TextRun['marks'] }];
    return [{ id: blockId('paragraph', node.value, idCounts), type: 'paragraph', content }];
  }
  const flattened = plainTextNode(node).trim();
  if (flattened) {
    diagnostics.push({
      code: 'Article.BlockFlattened',
      message: `Unsupported Markdown block ${node.type} was converted to text.`,
      severity: 'warning',
      path: `blocks.${index}`
    });
    const content = [{ text: flattened, marks: [] as TextRun['marks'] }];
    return [{ id: blockId('paragraph', flattened, idCounts), type: 'paragraph', content }];
  }
  diagnostics.push({
    code: 'Article.BlockSkipped',
    message: `Empty Markdown block ${node.type} was skipped.`,
    severity: 'warning',
    path: `blocks.${index}`
  });
  return [];
}

function convertParagraph(
  nodes: PhrasingContent[],
  index: number,
  idCounts: Map<string, number>,
  diagnostics: Diagnostic[]
): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];
  let runs: TextRun[] = [];
  const append = (value: string, marks: TextRun['marks'], href?: string) => {
    if (!value) return;
    const previous = runs[runs.length - 1];
    if (previous && previous.marks.join(',') === marks.join(',') && previous.href === href)
      previous.text += value;
    else runs.push({ text: value, marks, ...(href ? { href } : {}) });
  };
  const flush = () => {
    if (!runs.length) return;
    const text = runsText(runs);
    blocks.push({ id: blockId('paragraph', text, idCounts), type: 'paragraph', content: runs });
    runs = [];
  };
  const addImage = (src: string, alt: string, caption?: string) => {
    flush();
    blocks.push({
      id: blockId('image', `${src}\n${alt}\n${caption ?? ''}`, idCounts),
      type: 'image',
      src,
      alt,
      ...(caption ? { caption: [{ text: caption, marks: [] }] } : {})
    });
  };
  const walk = (node: PhrasingContent, marks: TextRun['marks'] = [], href?: string): void => {
    if (node.type === 'text') append(node.value, marks, href);
    else if (node.type === 'image') addImage(node.url, node.alt ?? '', node.title ?? undefined);
    else if (node.type === 'imageReference') addImage(node.identifier, node.alt ?? '');
    else if (node.type === 'inlineCode') append(node.value, [...marks, 'code'], href);
    else if (node.type === 'strong' || node.type === 'emphasis') {
      const mark = node.type === 'strong' ? 'strong' : 'emphasis';
      for (const child of node.children) walk(child, [...marks, mark], href);
    } else if (node.type === 'link' || node.type === 'linkReference') {
      const link = node.type === 'link' ? node.url : node.identifier;
      for (const child of node.children) walk(child, [...marks, 'link'], link);
    } else if (node.type === 'break') append('\n', marks, href);
    else if ('children' in node) {
      for (const child of node.children) walk(child as PhrasingContent, marks, href);
    }
  };
  for (const node of nodes) walk(node);
  flush();
  return blocks;
}

function phrasingRuns(
  nodes: PhrasingContent[],
  diagnostics: Diagnostic[],
  path: string
): TextRun[] {
  const runs: TextRun[] = [];
  const append = (text: string, marks: TextRun['marks'], href?: string): void => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && sameMarks(last.marks, marks) && last.href === href) last.text += text;
    else runs.push({ text, marks, ...(href ? { href } : {}) });
  };
  const walk = (node: PhrasingContent, marks: TextRun['marks'] = []): void => {
    if (node.type === 'text') append(node.value, marks);
    else if (node.type === 'inlineCode') append(node.value, [...marks, 'code']);
    else if (node.type === 'strong' || node.type === 'emphasis') {
      const mark = node.type === 'strong' ? 'strong' : 'emphasis';
      for (const child of node.children) walk(child, [...marks, mark]);
    } else if (node.type === 'link' || node.type === 'linkReference') {
      const href = node.type === 'link' ? node.url : node.identifier;
      for (const child of node.children) {
        if (child.type === 'text') append(child.value, [...marks, 'link'], href);
        else walk(child, [...marks, 'link']);
      }
    } else if (node.type === 'break') append('\n', marks);
    else if (node.type === 'image' || node.type === 'imageReference') {
      diagnostics.push({
        code: 'Article.InlineImageFlattened',
        message: 'Image placement was separated from surrounding text.',
        severity: 'warning',
        path
      });
      append(node.alt ?? '', marks);
    } else if ('children' in node) {
      for (const child of node.children) walk(child as PhrasingContent, marks);
    }
  };
  for (const node of nodes) walk(node);
  return runs;
}

function plainText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'inlineCode') return node.value;
      if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
      if ('children' in node) return plainText(node.children as PhrasingContent[]);
      return '';
    })
    .join('');
}

function plainTextNode(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const record = node as { value?: unknown; alt?: unknown; children?: unknown[]; url?: unknown };
  if (typeof record.value === 'string') return record.value;
  if (typeof record.alt === 'string') return record.alt;
  if (Array.isArray(record.children))
    return record.children.map(plainTextNode).filter(Boolean).join(' ');
  return typeof record.url === 'string' ? record.url : '';
}

function fallbackDocument(source: string, options: ParseArticleOptions): SemanticDocument {
  const title = fallbackTitle(options);
  const text = source.trim();
  const blocks: SemanticBlock[] = text
    ? [
        {
          id: blockId('paragraph', text, new Map()),
          type: 'paragraph',
          content: [{ text, marks: [] }]
        }
      ]
    : [];
  return {
    schemaVersion: 1,
    id: `article-${hashText(options.sourceId?.trim() || title)}`,
    metadata: { title },
    blocks
  };
}

function fallbackTitle(options: ParseArticleOptions): string {
  const sourceId = options.sourceId?.replace(/\\/g, '/').split('/').pop() ?? '';
  const stem = sourceId.replace(/\.(md|markdown)$/i, '').trim();
  return stem && stem !== 'desktop-draft' ? stem : (options.fallbackTitle ?? 'Untitled article');
}

function runsText(runs: TextRun[]): string {
  return runs.map((run) => run.text).join('');
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
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sameMarks(left: TextRun['marks'], right: TextRun['marks']): boolean {
  return left.length === right.length && left.every((mark, index) => mark === right[index]);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
