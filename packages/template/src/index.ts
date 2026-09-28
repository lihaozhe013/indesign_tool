import type {
  CompiledPageRole,
  CompiledTemplate,
  Diagnostic,
  PageRole,
  StyleKind,
  StyleRole,
  TemplateFrame,
  TemplateInventory
} from '@folio/contracts';
import { validateVersionedObject } from '@folio/contracts';
export { createTemplateInventory } from './scan.js';
export type { CreateTemplateInventoryResult } from './scan.js';
export { deriveRoleAssignments } from './roles.js';
export type { DeriveRoleAssignmentsOptions, DeriveRoleAssignmentsResult } from './roles.js';
export { resolveTemplateRoles } from './resolve.js';
export type {
  MatchConfidence,
  ResolveTemplateRolesOptions,
  ResolveTemplateRolesResult,
  RoleCandidate,
  RoleResolution
} from './resolve.js';

const requiredPages: PageRole[] = ['Cover', 'Article'];
const requiredStyles: StyleRole[] = ['ArticleTitle', 'SectionHeading', 'Body'];
const styleKinds: Record<StyleRole, StyleKind> = {
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
const frameKinds: Record<string, 'text' | 'graphic'> = {
  'hero-title': 'text',
  'hero-subtitle': 'text',
  'hero-image': 'graphic',
  'article-flow': 'text'
};

export interface CompileTemplateResult {
  template?: CompiledTemplate;
  diagnostics: Diagnostic[];
}

export function compileTemplate(inventory: TemplateInventory): CompileTemplateResult {
  const diagnostics: Diagnostic[] = [...validateVersionedObject(inventory, 'TemplateInventory')];
  if (!inventory.templateId.trim())
    diagnostics.push(
      error('Template.IdentityMissing', 'Template identity is required', 'templateId')
    );
  if (!inventory.name.trim())
    diagnostics.push(error('Template.NameMissing', 'Template name is required', 'name'));

  assertUnique(
    inventory.pages.map((page) => page.ref),
    'Template.DuplicatePageRef',
    'pages',
    diagnostics
  );
  assertUnique(
    inventory.frames.map((frame) => frame.ref),
    'Template.DuplicateFrameRef',
    'frames',
    diagnostics
  );

  const pagesByRole = new Map<PageRole, typeof inventory.pages>();
  for (const page of inventory.pages) {
    if (!page.role) continue;
    const pages = pagesByRole.get(page.role) ?? [];
    pages.push(page);
    pagesByRole.set(page.role, pages);
  }
  if (!inventory.pages.length)
    diagnostics.push(error('Template.PagesMissing', 'The template has no usable pages', 'pages'));
  const documentPages = inventory.pages.filter((page) => page.source === 'page');
  for (const role of requiredPages) {
    if (pagesByRole.has(role)) continue;
    const page =
      role === 'Cover'
        ? (documentPages[0] ?? inventory.pages[0])
        : (documentPages[1] ?? documentPages[0] ?? inventory.pages[1] ?? inventory.pages[0]);
    if (page) pagesByRole.set(role, [page]);
    diagnostics.push(
      warning(
        'Template.PageRoleFallback',
        `Folio selected a page for ${role} by document order.`,
        'pages.' + role
      )
    );
  }
  for (const [role, pages] of pagesByRole) {
    if (pages.length > 1) {
      diagnostics.push(
        warning(
          'Template.PageRoleAmbiguous',
          'Multiple pages declare role ' + role + '; Folio selected the first page.',
          'pages.' + role
        )
      );
      pagesByRole.set(role, [pages[0]!]);
    }
  }

  const pageRefs = new Set(inventory.pages.map((page) => page.ref));
  const framesByRole = new Map<string, TemplateFrame[]>();
  for (const frame of inventory.frames) {
    if (!pageRefs.has(frame.pageRef))
      diagnostics.push(
        warning(
          'Template.FramePageMissing',
          'Folio could not associate a frame with a scanned page and will use a fallback if needed.',
          'frames.' + frame.ref
        )
      );
    const expectedKind = frameKinds[frame.role];
    if (expectedKind && expectedKind !== frame.kind) {
      diagnostics.push(
        warning(
          'Template.FrameKindMismatch',
          `The selected ${frame.role} candidate has the wrong object type and was ignored.`,
          `frames.${frame.ref}`
        )
      );
      continue;
    }
    const matches = framesByRole.get(frame.role) ?? [];
    matches.push(frame);
    framesByRole.set(frame.role, matches);
  }
  const articlePage = pagesByRole.get('Article')?.[0];
  const articleFlowFrames = framesByRole.get('article-flow') ?? [];
  if (
    articlePage &&
    !articleFlowFrames.some((frame) => frame.pageRef === articlePage.ref && frame.kind === 'text')
  ) {
    diagnostics.push(
      warning(
        'Template.ArticleFlowMissing',
        'Folio will create an article flow frame in the output copy.',
        'frames.article-flow'
      )
    );
  }
  if (articleFlowFrames.length > 1) {
    diagnostics.push(
      warning(
        'Template.ArticleFlowAmbiguous',
        'Several article flow frames were found; Folio selected the first suitable frame.',
        'frames.article-flow'
      )
    );
  }
  for (const [role, frames] of framesByRole) {
    if (role !== 'article-flow' && frames.length > 1) {
      diagnostics.push(
        warning(
          'Template.FrameRoleAmbiguous',
          'Multiple frames declare role ' + role + '; Folio selected the first.',
          'frames.' + role
        )
      );
    }
  }

  const styleRoles: Partial<Record<StyleRole, string>> = {};
  for (const role of Object.keys(styleKinds) as StyleRole[]) {
    const matches = inventory.styles.filter(
      (style) => style.role === role || style.name === role || style.qualifiedName === role
    );
    const selected = matches.find((style) => style.kind === styleKinds[role]);
    if (selected) styleRoles[role] = selected.qualifiedName;
  }
  for (const role of Object.keys(styleKinds) as StyleRole[]) {
    const matches = inventory.styles.filter(
      (style) => style.role === role || style.name === role || style.qualifiedName === role
    );
    const expectedKind = styleKinds[role];
    const correctlyTyped = matches.filter((style) => style.kind === expectedKind);
    if (correctlyTyped.length > 1) {
      diagnostics.push(
        warning(
          'Template.StyleAmbiguous',
          `Multiple styles match role ${role}; Folio selected the first.`,
          `styles.${role}`
        )
      );
    }
    if (correctlyTyped.length) continue;
    if (matches.length) {
      diagnostics.push(
        warning(
          'Template.StyleKindMismatch',
          `The style found for ${role} has the wrong type; Folio will use a compatible style or InDesign defaults.`,
          `styles.${role}`
        )
      );
    } else {
      const fallbackRole =
        role === 'SectionHeading'
          ? 'Subheading'
          : role === 'Subheading'
            ? 'SectionHeading'
            : role === 'ArticleTitle' ||
                role === 'Emphasis' ||
                role === 'Link' ||
                role === 'Code' ||
                role === 'InlineImage' ||
                role === 'HeroImage'
              ? undefined
              : 'Body';
      if (fallbackRole && styleRoles[fallbackRole]) {
        styleRoles[role] = styleRoles[fallbackRole];
        diagnostics.push(
          warning(
            'Template.StyleFallback',
            `Folio will use ${fallbackRole} formatting for ${role}.`,
            `styles.${role}`
          )
        );
      } else if ((role === 'SectionHeading' || role === 'Subheading') && styleRoles.Body) {
        styleRoles[role] = styleRoles.Body;
        diagnostics.push(
          warning(
            'Template.StyleFallback',
            `Folio will use Body formatting for ${role}.`,
            `styles.${role}`
          )
        );
      } else if (role === 'Body') {
        const paragraphStyle = inventory.styles.find((style) => style.kind === 'paragraph');
        if (paragraphStyle) {
          styleRoles.Body = paragraphStyle.qualifiedName;
          diagnostics.push(
            warning(
              'Template.StyleFallback',
              `Folio will use ${paragraphStyle.name} as the body style.`,
              'styles.Body'
            )
          );
        } else {
          diagnostics.push(
            warning(
              'Template.StyleMissing',
              'No paragraph style was found; InDesign defaults will be used.',
              'styles.Body'
            )
          );
        }
      } else if (requiredStyles.includes(role)) {
        diagnostics.push(
          warning(
            'Template.StyleMissing',
            `Required style role is missing: ${role}; InDesign defaults will be used.`,
            `styles.${role}`
          )
        );
      } else {
        diagnostics.push(
          warning(
            'Template.StyleMissing',
            `Style role ${role} is unavailable and will be skipped.`,
            `styles.${role}`
          )
        );
      }
    }
  }

  if (diagnostics.some((item) => item.severity === 'error')) return { diagnostics };
  const pageRoles: Partial<Record<PageRole, CompiledPageRole>> = {};
  for (const [role, pages] of pagesByRole) {
    const page = pages[0]!;
    const flow =
      role === 'Article'
        ? articleFlowFrames.find((frame) => frame.pageRef === page.ref && frame.kind === 'text')
        : undefined;
    pageRoles[role] = { sourcePageRef: page.ref, ...(flow ? { flowFrameRef: flow.ref } : {}) };
  }
  const frameRoles = Object.fromEntries(
    [...framesByRole].map(([role, frames]) => [role, frames[0]!.ref])
  );
  if (!frameRoles['hero-title']) frameRoles['hero-title'] = '$auto:hero-title';
  if (!frameRoles['hero-subtitle']) frameRoles['hero-subtitle'] = '$auto:hero-subtitle';
  if (!frameRoles['article-flow']) frameRoles['article-flow'] = '$auto:article-flow';
  if (!pageRoles.Article?.flowFrameRef)
    pageRoles.Article = {
      sourcePageRef:
        pageRoles.Article?.sourcePageRef ??
        inventory.pages[1]?.ref ??
        inventory.pages[0]?.ref ??
        '',
      flowFrameRef: '$auto:article-flow'
    };
  return {
    template: {
      schemaVersion: 1,
      templateId: inventory.templateId,
      name: inventory.name,
      pageRoles,
      frameRoles,
      styleRoles,
      requiredAssets: [...new Set(inventory.requiredAssets)].sort()
    },
    diagnostics
  };
}

function assertUnique(
  values: string[],
  code: string,
  path: string,
  diagnostics: Diagnostic[]
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) diagnostics.push(error(code, 'Duplicate reference: ' + value, path));
    seen.add(value);
  }
}

function error(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: 'error', path };
}

function warning(code: string, message: string, path: string): Diagnostic {
  return { code, message, severity: 'warning', path };
}
