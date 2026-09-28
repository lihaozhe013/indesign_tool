import { describe, expect, it } from 'vitest';
import type { DocumentDump, SemanticDocument } from '@folio/contracts';
import { parseArticle } from '@folio/core';
import { verifyDocumentDump } from './publication-verification.js';

const article = parseArticle(`---
title: Document verification
subtitle: Reopened output check
---

# Document verification

\u6b63\u6587\u4e2d\u7684\u4e2d\u6587\u4e0e English text must survive exactly.

![A figure](assets/figure.png "Caption text")
`).document!;

function dumpFor(document: SemanticDocument): DocumentDump {
  const paragraphs: DocumentDump['stories'][number]['paragraphs'] = [];
  for (const block of document.blocks) {
    if (block.type === 'divider') continue;
    if (block.type === 'image') {
      paragraphs.push({ semanticId: block.id, text: '' });
      if (block.caption)
        paragraphs.push({
          semanticId: block.id,
          text: block.caption.map((run) => run.text).join('')
        });
      continue;
    }
    paragraphs.push({ semanticId: block.id, text: block.content.map((run) => run.text).join('') });
  }
  return {
    schemaVersion: 1,
    pages: [
      { id: 'page-cover', index: 0, role: 'Cover' },
      { id: 'page-article-001', index: 1, role: 'Article' }
    ],
    stories: [{ id: 'story-main', overset: false, paragraphs }],
    frames: [
      { semanticRole: 'hero-title', pageIndex: 0, text: document.metadata.title },
      { semanticRole: 'hero-subtitle', pageIndex: 0, text: document.metadata.subtitle }
    ],
    missingAssets: [],
    missingFonts: []
  };
}

describe('verifyDocumentDump', () => {
  it('accepts saved title, subtitle, body text, and image caption', () => {
    expect(verifyDocumentDump(dumpFor(article), article)).toEqual([]);
  });

  it('reports lost text, residual overflow, and missing assets as warnings', () => {
    const dump = dumpFor(article);
    dump.stories[0]!.overset = true;
    dump.stories[0]!.paragraphs[0]!.text = 'Truncated body';
    dump.missingAssets = ['assets/figure.png'];
    dump.missingFonts = ['Example Sans'];

    expect(verifyDocumentDump(dump, article).map((item) => [item.code, item.severity])).toEqual([
      ['Story.UnexpectedOverset', 'warning'],
      ['Document.TextChanged', 'warning'],
      ['Asset.Missing', 'warning'],
      ['Font.Missing', 'warning']
    ]);
  });

  it('rejects a subtitle that has no matching cover frame', () => {
    const dump = dumpFor(article);
    dump.frames = dump.frames.filter((frame) => frame.semanticRole !== 'hero-subtitle');

    expect(verifyDocumentDump(dump, article).map((item) => item.code)).toContain(
      'Document.CoverSubtitleChanged'
    );
  });

  it('finds and checks an unlabeled article story through its article flow frame', () => {
    const dump = dumpFor(article);
    dump.stories[0]!.paragraphs = dump.stories[0]!.paragraphs.map(
      ({ semanticId: _semanticId, ...paragraph }) => paragraph
    );
    dump.stories.unshift({ id: 'master-story', overset: false, paragraphs: [] });
    dump.frames.push(
      { semanticRole: 'article-flow', storyId: 'master-story' },
      { semanticRole: 'article-flow', storyId: dump.stories[1]!.id, pageIndex: 1 }
    );

    expect(verifyDocumentDump(dump, article)).toEqual([]);

    dump.stories[1]!.paragraphs[0]!.text = 'Changed text';
    expect(verifyDocumentDump(dump, article).map((item) => item.code)).toContain(
      'Document.TextChanged'
    );
  });
});
