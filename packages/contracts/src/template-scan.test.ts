import { describe, expect, it } from 'vitest';
import type { TemplateScan } from './index.js';
import { validateTemplateRoleAssignments, validateTemplateScan } from './index.js';

const scan: TemplateScan = {
  schemaVersion: 1,
  host: { application: 'InDesign', version: '21.0.0.192', domVersion: '21.0' },
  document: {
    name: 'Sample',
    modified: false,
    horizontalMeasurementUnits: 'POINTS',
    verticalMeasurementUnits: 'POINTS',
    pageCount: 1,
    spreadCount: 1,
    parentPageCount: 1,
    storyCount: 1
  },
  pages: [
    {
      ref: 'page:1',
      index: 0,
      name: '1',
      appliedParentPageRef: 'parent:1',
      bounds: [0, 0, 100, 100]
    }
  ],
  parentPages: [{ ref: 'parent:1', index: 0, name: 'A-Article' }],
  frames: [
    {
      ref: 'frame:1',
      index: 0,
      name: 'Main flow',
      kind: 'text',
      parentPageRef: 'parent:1',
      storyRef: 'story:1',
      textLength: 12,
      overset: false
    }
  ],
  stories: [{ ref: 'story:1', index: 0, textLength: 12, overset: false, frameRefs: ['frame:1'] }],
  styles: [
    {
      ref: 'style:1',
      index: 0,
      kind: 'paragraph',
      name: 'Title',
      qualifiedName: 'Article / Title'
    },
    {
      ref: 'style:2',
      index: 1,
      kind: 'paragraph',
      name: 'Heading',
      qualifiedName: 'Article / Heading'
    },
    { ref: 'style:3', index: 2, kind: 'paragraph', name: 'Body', qualifiedName: 'Article / Body' }
  ],
  assets: [{ ref: 'asset:1', name: 'cover.png', format: 'PNG', status: 'NORMAL' }],
  fonts: [{ name: 'Noto Sans Regular', family: 'Noto Sans', style: 'Regular', status: 'INSTALLED' }]
};

describe('TemplateScan v1', () => {
  it('validates an inspectable host scan without requiring role annotations', () => {
    expect(validateTemplateScan(scan)).toEqual([]);
  });

  it('accepts unnamed host page items', () => {
    const unnamed: TemplateScan = {
      ...scan,
      frames: [{ ...scan.frames[0]!, name: '' }]
    };
    expect(validateTemplateScan(unnamed)).toEqual([]);
  });

  it('rejects malformed bounds and repeated frame references', () => {
    const malformed: TemplateScan = {
      ...scan,
      pages: [{ ...scan.pages[0]!, bounds: [0, 0, Number.NaN, 100] }],
      frames: [...scan.frames, { ...scan.frames[0]! }]
    };
    const diagnostics = validateTemplateScan(malformed);
    expect(diagnostics.map((item) => item.path)).toContain('pages.0');
    expect(diagnostics.map((item) => item.path)).toContain('frames.1.ref');
  });

  it('rejects broken scan references and count mismatches', () => {
    const malformed: TemplateScan = {
      ...scan,
      document: { ...scan.document, pageCount: 2 },
      frames: [{ ...scan.frames[0]!, storyRef: 'story:missing' }],
      stories: [{ ...scan.stories[0]!, frameRefs: ['frame:missing'] }]
    };
    const paths = validateTemplateScan(malformed).map((item) => item.path);
    expect(paths).toContain('document.pageCount');
    expect(paths).toContain('stories.0.frameRefs.0');
    expect(paths).toContain('frames.0.storyRef');
  });

  it('rejects story and frame ownership mismatches', () => {
    const malformed: TemplateScan = {
      ...scan,
      stories: [{ ...scan.stories[0]!, frameRefs: ['frame:1'] }],
      frames: [{ ...scan.frames[0]!, storyRef: 'story:other' }]
    };
    const diagnostics = validateTemplateScan(malformed);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: 'stories.0.frameRefs.0',
        code: 'Schema.InvalidValue'
      })
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        path: 'frames.0.storyRef',
        code: 'Schema.InvalidValue'
      })
    );
  });

  it('validates saved role assignments as versioned data', () => {
    const assignments = {
      schemaVersion: 1 as const,
      templateId: 'sample-template',
      name: 'Sample',
      pageRoles: [
        { ref: 'page:1', role: 'Cover' as const },
        { ref: 'parent:1', role: 'Article' as const }
      ],
      frameRoles: [{ ref: 'frame:1', role: 'article-flow' }],
      styleRoles: [
        { ref: 'style:1', role: 'ArticleTitle' as const },
        { ref: 'style:2', role: 'SectionHeading' as const },
        { ref: 'style:3', role: 'Body' as const }
      ],
      requiredAssets: []
    };
    expect(validateTemplateRoleAssignments(assignments)).toEqual([]);
    expect(validateTemplateRoleAssignments({ ...assignments, schemaVersion: 2 })).toContainEqual(
      expect.objectContaining({
        code: 'Schema.UnsupportedVersion',
        severity: 'error'
      })
    );
  });
});
