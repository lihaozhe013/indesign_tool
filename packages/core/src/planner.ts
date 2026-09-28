import type {
  CompiledTemplate,
  Diagnostic,
  DocumentIR,
  DocumentPageIR,
  HostObservation,
  SemanticDocument
} from '@folio/contracts';

export interface PlanningResult {
  ir?: DocumentIR;
  diagnostics: Diagnostic[];
}

export function planDocument(
  document: SemanticDocument,
  template: CompiledTemplate
): PlanningResult {
  const diagnostics: Diagnostic[] = [];
  if (!template.pageRoles.Cover)
    diagnostics.push(
      warning('Template.PageRoleFallback', 'Folio will use the first available page as the cover.')
    );
  if (!template.pageRoles.Article?.flowFrameRef)
    diagnostics.push(
      warning(
        'Template.ArticleFlowMissing',
        'Folio will create an article flow frame in the output copy.'
      )
    );
  if (!template.styleRoles.ArticleTitle)
    diagnostics.push(
      warning('Template.StyleMissing', 'Folio will use the cover frame formatting for the title.')
    );
  if (document.metadata.subtitle && !template.styleRoles.Subtitle)
    diagnostics.push(
      warning(
        'Template.StyleMissingForContent',
        'Folio will use a compatible paragraph style for the subtitle.'
      )
    );
  const blockStyleRoles: Record<
    string,
    'SectionHeading' | 'Subheading' | 'Body' | 'Quote' | 'InlineImage'
  > = {};
  const captionStyleRoles: string[] = [];
  const characterStyleRoles: Array<{
    blockId: string;
    runIndex: number;
    styleRole: 'Emphasis' | 'Link' | 'Code';
  }> = [];
  for (const block of document.blocks) {
    const role =
      block.type === 'heading'
        ? block.level > 2
          ? 'Subheading'
          : 'SectionHeading'
        : block.type === 'quote'
          ? 'Quote'
          : block.type === 'image'
            ? 'InlineImage'
            : block.type === 'divider'
              ? undefined
              : 'Body';
    if (role) {
      if (!template.styleRoles[role])
        diagnostics.push(
          warning(
            'Template.StyleMissingForContent',
            'Article block ' +
              block.id +
              ' will use InDesign defaults because style role ' +
              role +
              ' is unavailable.'
          )
        );
      else blockStyleRoles[block.id] = role;
    }
    if (block.type === 'image' && block.caption && !template.styleRoles.Caption) {
      diagnostics.push(
        warning(
          'Template.StyleMissingForContent',
          'Image block ' + block.id + ' will use a compatible style because Caption is unavailable.'
        )
      );
    }
    if (block.type === 'image' && block.caption) captionStyleRoles.push(block.id);
    const runs =
      block.type === 'image' ? (block.caption ?? []) : 'content' in block ? block.content : [];
    runs.forEach((run, runIndex) => {
      const roles: Array<'Emphasis' | 'Link' | 'Code'> = [];
      if (run.marks.includes('strong') || run.marks.includes('emphasis')) roles.push('Emphasis');
      if (run.marks.includes('link')) roles.push('Link');
      if (run.marks.includes('code')) roles.push('Code');
      for (const styleRole of roles) {
        if (!template.styleRoles[styleRole])
          diagnostics.push(
            warning(
              'Template.StyleMissingForContent',
              'Text in block ' +
                block.id +
                ' will keep its content because style role ' +
                styleRole +
                ' is unavailable.'
            )
          );
        else characterStyleRoles.push({ blockId: block.id, runIndex, styleRole });
      }
    });
  }
  const pages: DocumentPageIR[] = [
    {
      id: 'page-cover',
      role: 'Cover',
      sourcePageRef:
        template.pageRoles.Cover?.sourcePageRef ?? template.pageRoles.Article?.sourcePageRef ?? '',
      stories: [],
      titleStyleRole: 'ArticleTitle',
      ...(document.metadata.subtitle ? { subtitleStyleRole: 'Subtitle' as const } : {})
    },
    {
      id: 'page-article-001',
      role: 'Article',
      sourcePageRef:
        template.pageRoles.Article?.sourcePageRef ?? template.pageRoles.Cover?.sourcePageRef ?? '',
      stories: ['main']
    }
  ];
  if (template.pageRoles.Ending) {
    pages.push({
      id: 'page-ending',
      role: 'Ending',
      sourcePageRef: template.pageRoles.Ending.sourcePageRef,
      stories: []
    });
  }
  return {
    ir: {
      schemaVersion: 1,
      articleId: document.id,
      templateId: template.templateId,
      pages,
      stories: {
        main: {
          id: 'main',
          blockIds: document.blocks.map((block) => block.id),
          blockStyleRoles,
          captionStyleRoles,
          characterStyleRoles
        }
      },
      assets: document.blocks.flatMap((block) =>
        block.type === 'image' ? [{ blockId: block.id, source: block.src, alt: block.alt }] : []
      )
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
    diagnostics.push({
      code: 'Asset.Missing',
      message: 'Asset could not be placed; Folio inserted a placeholder: ' + asset,
      severity: 'warning',
      context: { source: asset }
    });
  }
  for (const font of observation.missingFonts) {
    diagnostics.push({
      code: 'Font.Missing',
      message: 'Font substitution or missing font: ' + font,
      severity: 'warning',
      context: { font }
    });
  }
  for (const item of observation.warnings ?? []) {
    diagnostics.push({ ...item, severity: 'warning' });
  }
  if (!observation.overset.length) return { ir, diagnostics, addedPages: 0, complete: true };

  const mainOverflow = observation.overset.filter((item) => item.storyId === 'main');
  if (!mainOverflow.length) {
    diagnostics.push({
      code: 'Story.UnexpectedOverset',
      message:
        'InDesign reported overflow outside the article story; the generated document may need adjustment.',
      severity: 'warning'
    });
    return { ir, diagnostics, addedPages: 0, complete: true };
  }
  const articleRole = template.pageRoles.Article;
  if (!articleRole?.flowFrameRef) {
    diagnostics.push({
      code: 'Template.ArticleFlowMissing',
      message: 'Article flow could not be extended; the generated document may contain overflow.',
      severity: 'warning'
    });
    return { ir, diagnostics, addedPages: 0, complete: true };
  }
  if (ir.pages.length >= maxPages) {
    diagnostics.push({
      code: 'Story.PageLimitReached',
      message:
        'Reflow reached its page limit of ' + maxPages + '; the remaining text may overflow.',
      severity: 'warning',
      context: { maxPages }
    });
    return { ir, diagnostics, addedPages: 0, complete: true };
  }

  const articlePages = ir.pages.filter((page) => page.role === 'Article');
  const nextNumber = articlePages.length + 1;
  const newPage: DocumentPageIR = {
    id: 'page-article-' + String(nextNumber).padStart(3, '0'),
    role: 'Article',
    sourcePageRef: articleRole.sourcePageRef,
    stories: ['main']
  };
  const endingIndex = ir.pages.findIndex((page) => page.role === 'Ending');
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
  return { code, message, severity: 'error' };
}

function warning(code: string, message: string): Diagnostic {
  return { code, message, severity: 'warning' };
}
