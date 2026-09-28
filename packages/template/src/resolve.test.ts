import { describe, expect, it } from 'vitest';
import type { TemplateScan } from '@folio/contracts';
import { compileTemplate, createTemplateInventory } from './index.js';
import { resolveTemplateRoles } from './resolve.js';

function scanWith(overrides: Partial<TemplateScan> = {}): TemplateScan {
  return {
    schemaVersion: 1,
    host: { application: 'InDesign', version: '21.0.0.192', domVersion: '21.0' },
    document: {
      name: 'Designer template',
      modified: false,
      horizontalMeasurementUnits: 'POINTS',
      verticalMeasurementUnits: 'POINTS',
      pageCount: 3,
      spreadCount: 3,
      parentPageCount: 0,
      storyCount: 0
    },
    pages: [
      { ref: 'page:1', index: 0, name: 'cOvEr—Page' },
      { ref: 'page:2', index: 1, name: '正文 内容' },
      { ref: 'page:3', index: 2, name: 'Extra layout' }
    ],
    parentPages: [],
    frames: [
      {
        ref: 'frame:title-small',
        index: 0,
        name: 'Title',
        kind: 'text',
        pageRef: 'page:1',
        bounds: [30, 30, 70, 250]
      },
      {
        ref: 'frame:title-large',
        index: 1,
        name: 'Cover.Title!',
        kind: 'text',
        pageRef: 'page:1',
        bounds: [30, 30, 140, 430]
      },
      {
        ref: 'frame:wrong-title',
        index: 2,
        name: 'Hero Title',
        kind: 'graphic',
        pageRef: 'page:1'
      },
      {
        ref: 'frame:body',
        index: 3,
        name: '正文—主文本框',
        kind: 'text',
        pageRef: 'page:2',
        bounds: [30, 30, 760, 520]
      },
      { ref: 'frame:cover-image', index: 4, name: '封面图片', kind: 'graphic', pageRef: 'page:1' }
    ],
    stories: [],
    styles: [
      {
        ref: 'style:title',
        index: 0,
        kind: 'paragraph',
        name: 'Title',
        qualifiedName: '标题组 / Article Title'
      },
      {
        ref: 'style:body',
        index: 1,
        kind: 'paragraph',
        name: 'Body_text',
        qualifiedName: '正文组 / Body_text'
      },
      {
        ref: 'style:wrong-body',
        index: 2,
        kind: 'character',
        name: 'Body',
        qualifiedName: 'Character / Body'
      }
    ],
    assets: [],
    fonts: [],
    ...overrides
  };
}

function resolve(scan: TemplateScan = scanWith()) {
  return resolveTemplateRoles(scan, { templateId: 'fixture', name: 'Designer template' });
}

describe('resolveTemplateRoles', () => {
  it('matches untagged English and Chinese names after case, punctuation, and group normalization', () => {
    const result = resolve();
    const cover = result.resolutions.find((item) => item.role === 'Cover')!;
    const title = result.resolutions.find((item) => item.role === 'hero-title')!;
    const flow = result.resolutions.find((item) => item.role === 'article-flow')!;
    const body = result.resolutions.find((item) => item.role === 'Body')!;
    expect(cover.selected).toMatchObject({ ref: 'page:1', score: 90, matchedBy: 'name' });
    expect(cover.confidence).toBe('high');
    expect(title.selected).toMatchObject({ ref: 'frame:title-large', score: 90 });
    expect(title.confidence).toBe('high');
    expect(flow.selected?.ref).toBe('frame:body');
    expect(flow.confidence).toBe('possible');
    expect(body.selected).toMatchObject({ ref: 'style:body', score: 90 });
  });

  it('gives valid role labels the highest score and records the best three conflict candidates', () => {
    const scan = scanWith();
    scan.frames.push({
      ref: 'frame:title-third',
      index: 5,
      name: 'Main Title',
      kind: 'text',
      pageRef: 'page:1',
      bounds: [25, 25, 180, 480]
    });
    scan.frames[1]!.roleLabel = 'hero-title';
    scan.frames[1]!.name = 'Unusual designer name';
    const result = resolve(scan);
    const title = result.resolutions.find((item) => item.role === 'hero-title')!;
    expect(title.selected).toMatchObject({
      ref: 'frame:title-large',
      score: 100,
      matchedBy: 'label'
    });
    expect(title.candidates).toHaveLength(3);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'Template.RoleAmbiguous', severity: 'warning' })
    );
  });

  it('chooses the largest equal-scoring frame on the right page and then document order', () => {
    const scan = scanWith();
    scan.frames[0]!.name = 'Title';
    scan.frames[1]!.name = 'Title';
    const result = resolve(scan);
    expect(result.resolutions.find((item) => item.role === 'hero-title')?.selected?.ref).toBe(
      'frame:title-large'
    );
    scan.frames[0]!.bounds = scan.frames[1]!.bounds;
    expect(
      resolve(scan).resolutions.find((item) => item.role === 'hero-title')?.selected?.ref
    ).toBe('frame:title-small');
  });

  it('skips wrong frame and style types and reports them', () => {
    const scan = scanWith();
    scan.frames = scan.frames.filter(
      (frame) => frame.ref !== 'frame:title-small' && frame.ref !== 'frame:title-large'
    );
    scan.styles[1]!.kind = 'character';
    const result = resolve(scan);
    expect(result.resolutions.find((item) => item.role === 'hero-title')?.selected?.ref).not.toBe(
      'frame:wrong-title'
    );
    expect(result.resolutions.find((item) => item.role === 'Body')?.selected?.ref).not.toBe(
      'style:wrong-body'
    );
    expect(result.diagnostics.map((item) => item.code)).toContain('Template.FrameKindMismatch');
    expect(result.diagnostics.map((item) => item.code)).toContain('Template.StyleKindMismatch');
  });

  it('assigns a fuzzy shared style to its strongest role and lets compilation substitute it', () => {
    const scan = scanWith();
    scan.styles.push({
      ref: 'style:heading',
      index: 3,
      kind: 'paragraph',
      name: 'Heading',
      qualifiedName: 'Heading'
    });

    const result = resolve(scan);
    const assignments = result.assignments!;
    expect(assignments.styleRoles).toContainEqual({ ref: 'style:heading', role: 'SectionHeading' });
    expect(new Set(assignments.styleRoles.map((item) => item.ref)).size).toBe(
      assignments.styleRoles.length
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'Template.StyleRoleConflict', path: 'styleRoles.Subheading' })
    );

    const inventory = createTemplateInventory(scan, assignments);
    const compiled = compileTemplate(inventory.inventory!);
    expect(compiled.template?.styleRoles.Subheading).toBe(
      compiled.template?.styleRoles.SectionHeading
    );
  });

  it('uses a low-confidence layout candidate only as an automatic fallback', () => {
    const scan = scanWith();
    scan.frames = scan.frames.filter((frame) => !frame.ref.startsWith('frame:title-'));
    scan.frames.push({
      ref: 'frame:cover-box',
      index: 6,
      name: 'Box 7',
      kind: 'text',
      pageRef: 'page:1',
      bounds: [30, 30, 80, 200]
    });
    const title = resolve(scan).resolutions.find((item) => item.role === 'hero-title')!;
    expect(title.selected).toMatchObject({ ref: 'frame:cover-box', matchedBy: 'layout' });
    expect(title.selected!.score).toBeLessThan(65);
    expect(title.confidence).toBe('fallback');
  });

  it('uses a one-page template as both prototypes and compiles missing styles with warnings', () => {
    const onePage = scanWith({
      document: { ...scanWith().document, pageCount: 1, spreadCount: 1, parentPageCount: 1 },
      pages: [{ ref: 'page:only', index: 0, name: 'Page 1' }],
      parentPages: [{ ref: 'parent:only', index: 0, name: 'Parent A' }],
      frames: [],
      styles: []
    });
    const result = resolve(onePage);
    expect(result.resolutions.find((item) => item.role === 'Article')?.selected).toMatchObject({
      ref: 'page:only',
      score: 30
    });
    expect(result.resolutions.find((item) => item.role === 'Article')?.confidence).toBe('fallback');
    const inventory = createTemplateInventory(onePage, result.assignments!);
    const compiled = compileTemplate(inventory.inventory!);
    expect(compiled.template?.pageRoles.Article?.sourcePageRef).toBe('page:only');
    expect(compiled.template?.frameRoles['article-flow']).toBe('$auto:article-flow');
    expect(compiled.diagnostics.some((item) => item.severity === 'error')).toBe(false);
  });

  it('ignores unmarked extra pages and retains only an explicitly marked Ending page', () => {
    const scan = scanWith({
      document: { ...scanWith().document, pageCount: 4, spreadCount: 4 },
      pages: [
        { ref: 'page:1', index: 0, name: 'Cover' },
        { ref: 'page:2', index: 1, name: 'Article' },
        { ref: 'page:3', index: 2, name: 'Decorative spread' },
        { ref: 'page:4', index: 3, name: 'Ending' }
      ]
    });
    const result = resolve(scan);
    expect(result.assignments?.pageRoles).toContainEqual({ ref: 'page:4', role: 'Ending' });
    expect(result.assignments?.pageRoles).not.toContainEqual({ ref: 'page:3', role: 'Ending' });
    expect(result.assignments?.pageRoles.map(({ ref }) => ref)).not.toContain('page:3');
  });
});
