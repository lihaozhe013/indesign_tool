import type {
  Diagnostic,
  PageRole,
  StyleRole,
  TemplateRoleAssignments,
  TemplateScan,
  TemplateScanFrame,
  TemplateScanPage,
  TemplateScanStyle
} from '@folio/contracts';
import { validateTemplateScan } from '@folio/contracts';

export type MatchConfidence = 'high' | 'possible' | 'fallback';

export interface RoleCandidate {
  ref: string;
  name: string;
  kind: 'page' | 'parentPage' | 'text' | 'graphic' | 'paragraph' | 'character' | 'object';
  score: number;
  matchedBy: 'label' | 'name' | 'layout' | 'page-order';
}

export interface RoleResolution {
  role: string;
  selected?: RoleCandidate;
  confidence: MatchConfidence;
  candidates: RoleCandidate[];
}

export interface ResolveTemplateRolesOptions {
  templateId: string;
  name: string;
}

export interface ResolveTemplateRolesResult {
  assignments?: TemplateRoleAssignments;
  resolutions: RoleResolution[];
  diagnostics: Diagnostic[];
}

const pageAliases: Record<PageRole, string[]> = {
  Cover: ['Cover', 'Cover Page', 'Title Page', '封面', '首页', '标题页'],
  Article: ['Article', 'Article Page', 'Body Page', 'Content', '正文', '内容', '文章', '正文页'],
  Ending: ['Ending', 'End Page', 'Back Cover', '结尾', '结束页', '封底'],
  ImageFeature: ['ImageFeature', 'Image Feature', '图片专题']
};

const frameAliases: Record<string, string[]> = {
  'hero-title': ['Hero Title', 'Cover Title', 'Title', 'Main Title', '主标题', '封面标题'],
  'hero-subtitle': ['Hero Subtitle', 'Cover Subtitle', 'Subtitle', '副标题', '封面副标题'],
  'hero-image': ['Hero Image', 'Cover Image', 'Main Image', '封面图片', '主图'],
  'article-flow': [
    'Article Flow',
    'Main Text',
    'Body Text',
    'Article Text',
    '正文',
    '正文流',
    '主文本框'
  ]
};

const styleAliases: Record<StyleRole, string[]> = {
  ArticleTitle: ['ArticleTitle', 'Title', 'Cover Title', '文章标题', '封面标题', '主标题'],
  Subtitle: ['Subtitle', 'Article Subtitle', '副标题'],
  SectionHeading: ['SectionHeading', 'Heading 2', 'H2', 'Section Title', '二级标题', '小节标题'],
  Subheading: ['Subheading', 'Heading 3', 'H3', '三级标题', '小标题'],
  Body: ['Body', 'Body Text', 'Paragraph', '正文', '正文文本'],
  Quote: ['Quote', 'Blockquote', '引文', '引用'],
  Caption: ['Caption', 'Image Caption', '图注', '图片说明'],
  Emphasis: ['Emphasis', 'Bold', 'Italic', '强调'],
  Link: ['Link', 'Hyperlink', '链接'],
  Code: ['Code', 'Inline Code', '代码'],
  InlineImage: ['InlineImage', 'Inline Image', '正文图片'],
  HeroImage: ['HeroImage', 'Hero Image', 'Cover Image', '封面图片']
};

const roleKinds: Record<StyleRole, TemplateScanStyle['kind']> = {
  ArticleTitle: 'paragraph',
  Subtitle: 'paragraph',
  SectionHeading: 'paragraph',
  Subheading: 'paragraph',
  Body: 'paragraph',
  Quote: 'paragraph',
  Caption: 'paragraph',
  Emphasis: 'character',
  Link: 'character',
  Code: 'character',
  InlineImage: 'object',
  HeroImage: 'object'
};

export function resolveTemplateRoles(
  scan: TemplateScan,
  options: ResolveTemplateRolesOptions
): ResolveTemplateRolesResult {
  const diagnostics = validateTemplateScan(scan);
  const resolutions: RoleResolution[] = [];
  if (diagnostics.some((item) => item.severity === 'error')) return { resolutions, diagnostics };
  if (!options.templateId.trim() || !options.name.trim()) {
    return {
      resolutions,
      diagnostics: [
        ...diagnostics,
        error('Template.IdentityMissing', 'templateId and name are required', 'templateId')
      ]
    };
  }

  const pageRoles: TemplateRoleAssignments['pageRoles'] = [];
  const frameRoles: TemplateRoleAssignments['frameRoles'] = [];
  const styleRoles: TemplateRoleAssignments['styleRoles'] = [];
  const pages = scan.pages.map((page) => ({ page, kind: 'page' as const }));

  const cover = choosePage('Cover', pages, pageAliases.Cover, scan, 0);
  const articlePages =
    scan.document.pageCount === 1 ? pages : pages.filter(({ page }) => page.ref !== cover?.ref);
  const article = choosePage('Article', articlePages, pageAliases.Article, scan, 1);
  if (cover) {
    pageRoles.push({ ref: cover.ref, role: 'Cover' });
  }
  if (article && article.ref !== cover?.ref) {
    pageRoles.push({ ref: article.ref, role: 'Article' });
  }

  const ending = chooseExplicitPageRole('Ending', pages);
  if (ending && ending.ref !== cover?.ref && ending.ref !== article?.ref) {
    pageRoles.push({ ref: ending.ref, role: 'Ending' });
  }

  const resolvedPageRefs: Record<string, string | undefined> = {
    Cover: cover?.ref,
    Article: article?.ref
  };
  const usedFrameRefs = new Set<string>();
  for (const role of Object.keys(frameAliases)) {
    const expectedKind = role === 'hero-image' ? 'graphic' : 'text';
    const targetPageRef =
      role === 'article-flow' ? resolvedPageRefs.Article : resolvedPageRefs.Cover;
    const matchingRoleFrames = scan.frames.filter(
      (frame) => !hasConflictingFrameRole(frame.roleLabel ?? frame.label, role)
    );
    const incompatible = matchingRoleFrames.filter(
      (frame) =>
        frame.kind !== expectedKind &&
        scoreName(frame.name, frame.roleLabel ?? frame.label, frameAliases[role]!).score > 0
    );
    if (incompatible.length)
      diagnostics.push(
        warning(
          'Template.FrameKindMismatch',
          `Some candidates for ${role} have the wrong object type and were skipped.`,
          `frameRoles.${role}`,
          {
            candidates: incompatible
              .slice(0, 3)
              .map((frame) => frame.name || frame.ref)
              .join(', ')
          }
        )
      );
    const roleCandidates = matchingRoleFrames
      .filter((frame) => frame.kind === expectedKind)
      .map((frame) => ({
        frame,
        named: scoreName(frame.name, frame.roleLabel ?? frame.label, frameAliases[role]!)
      }))
      .filter(({ frame, named }) => named.score > 0 || frameOnPage(frame, targetPageRef, scan));
    const ranked = roleCandidates
      .map(({ frame, named }) => ({
        candidate: {
          ref: frame.ref,
          name: frame.name || frame.roleLabel || frame.label || frame.ref,
          kind: frame.kind,
          score: named.score || layoutScore(frame, role, targetPageRef, scan),
          matchedBy: named.score ? named.matchedBy : 'layout'
        } as RoleCandidate,
        frame
      }))
      .sort((left, right) => compareFrameCandidate(left, right, targetPageRef, scan));
    const eligible = ranked.filter(({ frame }) => !usedFrameRefs.has(frame.ref));
    const selected = eligible[0];
    const roleResolution = recordResolution(
      role,
      selected?.candidate,
      ranked.map(({ candidate }) => candidate),
      diagnostics
    );
    resolutions.push(roleResolution);
    if (selected) {
      usedFrameRefs.add(selected.frame.ref);
      frameRoles.push({ ref: selected.frame.ref, role });
    } else if (role === 'hero-image') {
      diagnostics.push(
        warning(
          'Template.CoverImageFrameMissing',
          'No cover image frame was found; article images will still be placed in the body.',
          'frameRoles.hero-image'
        )
      );
    } else {
      diagnostics.push(
        warning(
          'Template.RoleFallback',
          `Folio will create a ${role} frame in the output copy.`,
          `frameRoles.${role}`
        )
      );
    }
    if (selected && ranked.length > 1 && ranked[1]!.candidate.score >= 65) {
      diagnostics.push(
        warning(
          'Template.RoleAmbiguous',
          `Several frames could be used for ${role}; Folio selected ${selected.candidate.name}.`,
          `frameRoles.${role}`,
          {
            candidates: ranked
              .slice(0, 3)
              .map(({ candidate }) => `${candidate.name} (${candidate.score})`)
              .join(', ')
          }
        )
      );
    }
  }

  const styleRoleOrder = Object.keys(styleAliases) as StyleRole[];
  const styleRanks = new Map<
    StyleRole,
    Array<{ style: TemplateScanStyle; candidate: RoleCandidate }>
  >();
  for (const role of styleRoleOrder) {
    const expectedKind = roleKinds[role];
    const matchingRoleStyles = scan.styles.filter(
      (style) => !hasConflictingStyleRole(style.roleLabel, role)
    );
    const incompatible = matchingRoleStyles.filter(
      (style) =>
        style.kind !== expectedKind &&
        scoreName(style.name, style.roleLabel, styleAliases[role]!).score > 0
    );
    if (incompatible.length)
      diagnostics.push(
        warning(
          'Template.StyleKindMismatch',
          `Some candidates for ${role} have the wrong style type and were skipped.`,
          `styleRoles.${role}`,
          {
            candidates: incompatible
              .slice(0, 3)
              .map((style) => style.qualifiedName || style.name)
              .join(', ')
          }
        )
      );
    const ranked = matchingRoleStyles
      .filter((style) => style.kind === expectedKind)
      .map((style) => ({
        style,
        candidate: scoreName(style.name, style.roleLabel, styleAliases[role]!)
      }))
      .filter(({ candidate }) => candidate.score > 0)
      .map(({ style, candidate }) => ({
        style,
        candidate: {
          ref: style.ref,
          name: style.qualifiedName || style.name,
          kind: style.kind,
          ...candidate
        } as RoleCandidate
      }))
      .sort(
        (left, right) =>
          right.candidate.score - left.candidate.score || left.style.index - right.style.index
      );
    styleRanks.set(role, ranked);
  }

  const styleRank = new Map(styleRoleOrder.map((role, index) => [role, index]));
  const stylePairs = styleRoleOrder
    .flatMap((role) => (styleRanks.get(role) ?? []).map((match) => ({ role, ...match })))
    .sort(
      (left, right) =>
        right.candidate.score - left.candidate.score ||
        styleRank.get(left.role)! - styleRank.get(right.role)! ||
        left.style.index - right.style.index
    );
  const selectedStyles = new Map<
    StyleRole,
    { style: TemplateScanStyle; candidate: RoleCandidate }
  >();
  const selectedStyleOwners = new Map<string, StyleRole>();
  for (const match of stylePairs) {
    if (selectedStyles.has(match.role) || selectedStyleOwners.has(match.style.ref)) continue;
    selectedStyles.set(match.role, match);
    selectedStyleOwners.set(match.style.ref, match.role);
  }

  for (const role of styleRoleOrder) {
    const ranked = styleRanks.get(role) ?? [];
    const selected = selectedStyles.get(role);
    resolutions.push(
      recordResolution(
        role,
        selected?.candidate,
        ranked.map(({ candidate }) => candidate),
        diagnostics
      )
    );
    if (selected) {
      styleRoles.push({ ref: selected.style.ref, role });
      if (ranked.length > 1)
        diagnostics.push(
          warning(
            'Template.RoleAmbiguous',
            `Several styles could be used for ${role}; Folio selected ${selected.candidate.name}.`,
            `styleRoles.${role}`,
            {
              candidates: ranked
                .slice(0, 3)
                .map(({ candidate }) => `${candidate.name} (${candidate.score})`)
                .join(', ')
            }
          )
        );
    } else {
      const conflictingRole = ranked
        .map(({ style }) => selectedStyleOwners.get(style.ref))
        .find(Boolean);
      if (conflictingRole)
        diagnostics.push(
          warning(
            'Template.StyleRoleConflict',
            `A style candidate for ${role} was assigned to ${conflictingRole}; Folio will use a compatible fallback.`,
            `styleRoles.${role}`,
            {
              role,
              assignedRole: conflictingRole,
              candidates: ranked
                .slice(0, 3)
                .map(({ candidate }) => `${candidate.name} (${candidate.score})`)
                .join(', ')
            }
          )
        );
      diagnostics.push(
        warning(
          'Template.RoleFallback',
          `Folio will use a compatible style or InDesign defaults for ${role}.`,
          `styleRoles.${role}`
        )
      );
    }
  }

  for (const pageRole of ['Cover', 'Article'] as const) {
    const selected = pageRole === 'Cover' ? cover : article;
    const candidates = pages
      .map(({ page, kind }) => ({
        page,
        candidate: scorePage(page, kind, pageAliases[pageRole], pageRole === 'Cover' ? 0 : 1, scan)
      }))
      .filter(({ candidate }) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.candidate.score - left.candidate.score || left.page.index - right.page.index
      );
    const candidate = selected
      ? candidates.find(({ page }) => page.ref === selected.ref)?.candidate
      : undefined;
    resolutions.push(
      recordResolution(
        pageRole,
        candidate,
        candidates.map(({ candidate: item }) => item),
        diagnostics
      )
    );
    if (selected && candidates.length > 1 && candidates[1]!.candidate.score >= 65)
      diagnostics.push(
        warning(
          'Template.RoleAmbiguous',
          `Several pages could be used for ${pageRole}; Folio selected ${selected.name}.`,
          `pageRoles.${pageRole}`,
          {
            candidates: candidates
              .slice(0, 3)
              .map(({ candidate: item }) => `${item.name} (${item.score})`)
              .join(', ')
          }
        )
      );
  }
  const endingPage = ending ? pages.find(({ page }) => page.ref === ending.ref) : undefined;
  const endingRoleLabel = endingPage?.page.roleLabel ?? endingPage?.page.label;
  const endingCandidate = endingPage
    ? ({
        ref: endingPage.page.ref,
        name: endingPage.page.name,
        kind: endingPage.kind,
        ...scoreName(endingPage.page.name, endingRoleLabel, pageAliases.Ending)
      } as RoleCandidate)
    : undefined;
  resolutions.push(
    recordResolution(
      'Ending',
      endingCandidate,
      endingCandidate ? [endingCandidate] : [],
      diagnostics
    )
  );

  if (pageRoles.length === 0 && cover) pageRoles.push({ ref: cover.ref, role: 'Cover' });
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
    resolutions,
    diagnostics
  };
}

function choosePage(
  role: 'Cover' | 'Article',
  pages: Array<{ page: TemplateScanPage; kind: 'page' | 'parentPage' }>,
  aliases: string[],
  scan: TemplateScan,
  fallbackIndex: number
): TemplateScanPage | undefined {
  const ranked = pages
    .map(({ page, kind }) => ({
      page,
      candidate: scorePage(page, kind, aliases, fallbackIndex, scan)
    }))
    .sort(
      (left, right) =>
        right.candidate.score - left.candidate.score || left.page.index - right.page.index
    );
  return ranked[0]?.page;
}

function chooseExplicitPageRole(
  role: PageRole,
  pages: Array<{ page: TemplateScanPage; kind: 'page' | 'parentPage' }>
): TemplateScanPage | undefined {
  return pages.find(({ page }) => {
    const label = page.roleLabel ?? page.label;
    return (
      label?.toLowerCase() === role.toLowerCase() ||
      scoreName(page.name, label, pageAliases[role]).score === 90
    );
  })?.page;
}

function scorePage(
  page: TemplateScanPage,
  kind: 'page' | 'parentPage',
  aliases: string[],
  fallbackIndex: number,
  scan: TemplateScan
): RoleCandidate {
  const roleLabel = page.roleLabel ?? page.label;
  if (roleLabel && ['Cover', 'Article', 'Ending', 'ImageFeature'].includes(roleLabel)) {
    const role = roleLabel;
    const requested = aliases === pageAliases.Cover ? 'Cover' : 'Article';
    if (role === requested)
      return { ref: page.ref, name: page.name, kind, score: 100, matchedBy: 'label' };
    return { ref: page.ref, name: page.name, kind, score: 0, matchedBy: 'label' };
  }
  const named = scoreName(page.name, roleLabel, aliases);
  if (named.score) return { ref: page.ref, name: page.name, kind, ...named };
  const appliedFlow = scan.frames.some(
    (frame) => frame.roleLabel === 'article-flow' && frame.parentPageRef === page.ref
  );
  const namedFlow = scan.frames.some(
    (frame) =>
      frame.kind === 'text' &&
      frameOnPage(frame, page.ref, scan) &&
      scoreName(frame.name, frame.roleLabel ?? frame.label, frameAliases['article-flow']!).score >=
        65
  );
  const fallbackScore =
    aliases === pageAliases.Article && (appliedFlow || namedFlow)
      ? 70
      : page.index === fallbackIndex ||
          (aliases === pageAliases.Article && scan.document.pageCount === 1 && kind === 'page')
        ? 30
        : 0;
  return {
    ref: page.ref,
    name: page.name,
    kind,
    score: fallbackScore,
    matchedBy: fallbackScore === 30 ? 'page-order' : 'layout'
  };
}

function scoreName(
  name: string,
  label: string | undefined,
  aliases: string[]
): Pick<RoleCandidate, 'score' | 'matchedBy'> {
  if (label && aliases.some((alias) => normalize(label) === normalize(alias)))
    return { score: 100, matchedBy: 'label' };
  const names = [name, ...name.split('/')].map(normalize).filter(Boolean);
  const normalizedAliases = aliases.map(normalize).filter(Boolean);
  if (names.some((item) => normalizedAliases.includes(item)))
    return { score: 90, matchedBy: 'name' };
  let similarity = 0;
  for (const item of names) {
    for (const alias of normalizedAliases) {
      if (item.includes(alias) || (item.length >= 4 && alias.includes(item)))
        similarity = Math.max(similarity, 0.82);
      else similarity = Math.max(similarity, tokenSimilarity(item, alias));
    }
  }
  if (similarity < 0.58) return { score: 0, matchedBy: 'name' };
  return {
    score: Math.min(89, Math.max(65, Math.round(65 + (similarity - 0.58) * 57))),
    matchedBy: 'name'
  };
}

function hasConflictingFrameRole(label: string | undefined, requested: string): boolean {
  if (!label) return false;
  const normalizedLabel = normalize(label);
  return Object.entries(frameAliases).some(
    ([role, aliases]) =>
      role !== requested &&
      (normalize(role) === normalizedLabel ||
        aliases.some((alias) => normalize(alias) === normalizedLabel))
  );
}

function hasConflictingStyleRole(label: string | undefined, requested: StyleRole): boolean {
  return Boolean(
    label &&
    (Object.keys(styleAliases) as StyleRole[]).includes(label as StyleRole) &&
    label !== requested
  );
}

function layoutScore(
  frame: TemplateScanFrame,
  role: string,
  pageRef: string | undefined,
  scan: TemplateScan
): number {
  if (!frameOnPage(frame, pageRef, scan)) return 0;
  const frameArea = area(frame.bounds);
  const page = scan.pages.find((candidate) => candidate.ref === pageRef);
  const pageArea = area(page?.bounds);
  const sizeRatio = pageArea > 0 ? Math.min(1, frameArea / pageArea) : 0;
  const top = frame.bounds?.[0] ?? 0;
  const pageTop = page?.bounds?.[0] ?? 0;
  const upper = top <= pageTop + Math.sqrt(pageArea || 1) * 0.55;
  if (role === 'hero-title') return Math.round(35 + sizeRatio * 12 + (upper ? 10 : 0));
  if (role === 'article-flow') return Math.round(40 + sizeRatio * 20);
  if (role === 'hero-subtitle') return 35;
  return Math.round(35 + sizeRatio * 15);
}

function frameOnPage(
  frame: TemplateScanFrame,
  pageRef: string | undefined,
  scan: TemplateScan
): boolean {
  if (!pageRef) return false;
  if (frame.pageRef === pageRef || frame.parentPageRef === pageRef) return true;
  const target = scan.pages.find((page) => page.ref === pageRef);
  return Boolean(
    target?.appliedParentPageRef && frame.parentPageRef === target.appliedParentPageRef
  );
}

function compareFrameCandidate(
  left: { candidate: RoleCandidate; frame: TemplateScanFrame },
  right: { candidate: RoleCandidate; frame: TemplateScanFrame },
  pageRef: string | undefined,
  scan: TemplateScan
): number {
  return (
    right.candidate.score - left.candidate.score ||
    Number(frameOnPage(right.frame, pageRef, scan)) -
      Number(frameOnPage(left.frame, pageRef, scan)) ||
    area(right.frame.bounds) - area(left.frame.bounds) ||
    left.frame.index - right.frame.index
  );
}

function recordResolution(
  role: string,
  selected: RoleCandidate | undefined,
  candidates: RoleCandidate[],
  diagnostics: Diagnostic[]
): RoleResolution {
  const confidence: MatchConfidence =
    !selected || selected.score < 65 ? 'fallback' : selected.score >= 85 ? 'high' : 'possible';
  if (selected) {
    diagnostics.push({
      code: confidence === 'high' ? 'Template.RoleMatched' : 'Template.RoleFallback',
      message: `${role} matched ${selected.name} with ${confidence} confidence.`,
      severity: confidence === 'high' ? 'info' : 'warning',
      path: role,
      context: {
        role,
        name: selected.name,
        score: selected.score,
        confidence,
        matchedBy: selected.matchedBy
      }
    });
  }
  return {
    role,
    ...(selected ? { selected } : {}),
    confidence,
    candidates: candidates.slice(0, 3)
  };
}

function tokenSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const leftTokens = new Set(splitTokens(left));
  const rightTokens = new Set(splitTokens(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union ? intersection / union : 0;
  const maxLength = Math.max(left.length, right.length);
  const edit = 1 - levenshtein(left, right) / maxLength;
  return Math.max(jaccard, edit * 0.85);
}

function splitTokens(value: string): string[] {
  return value.match(/[\p{Script=Han}]|[a-z0-9]+/gu) ?? [];
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/^[^/]+\s*\/\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshtein(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0]!;
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex]!;
      row[rightIndex] = Math.min(
        row[rightIndex]! + 1,
        row[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[right.length]!;
}

function area(bounds: [number, number, number, number] | undefined): number {
  if (!bounds) return 0;
  return Math.max(0, bounds[2] - bounds[0]) * Math.max(0, bounds[3] - bounds[1]);
}

function warning(
  code: string,
  message: string,
  path: string,
  context?: Record<string, string | number | boolean>
): Diagnostic {
  return { code, message, severity: 'warning', path, ...(context ? { context } : {}) };
}

function error(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: 'error', path };
}
