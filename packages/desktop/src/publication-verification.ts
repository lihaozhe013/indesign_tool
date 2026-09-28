import type { Diagnostic, DocumentDump, SemanticDocument } from '@folio/contracts';

export function verifyDocumentDump(dump: DocumentDump, document: SemanticDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (dump.schemaVersion !== 1)
    diagnostics.push({
      code: 'DocumentDump.SchemaInvalid',
      message: 'InDesign returned an unsupported document structure.',
      severity: 'warning'
    });
  const flowFrames = dump.frames.filter(
    (frame) => frame.semanticRole === 'article-flow' && frame.storyId
  );
  const flowStoryId =
    flowFrames.find((frame) => frame.pageIndex !== undefined)?.storyId ?? flowFrames[0]?.storyId;
  const mainStory =
    dump.stories.find((story) => story.id === flowStoryId) ??
    dump.stories.find((story) => story.paragraphs.some((paragraph) => paragraph.semanticId));
  if (!mainStory) {
    diagnostics.push({
      code: 'Document.MainStoryMissing',
      message: 'The generated document has no identifiable article story.',
      severity: 'warning'
    });
    return diagnostics;
  }
  if (mainStory.overset)
    diagnostics.push({
      code: 'Story.UnexpectedOverset',
      message: 'The saved article story still overflows its pages.',
      severity: 'warning'
    });
  const titleFrame = dump.frames.find((frame) => frame.semanticRole === 'hero-title');
  if (titleFrame?.text !== document.metadata.title)
    diagnostics.push({
      code: 'Document.CoverTitleMissing',
      message: 'The cover title did not survive the InDesign save and reopen check.',
      severity: 'warning'
    });
  const paragraphs = new Map(
    mainStory.paragraphs
      .filter((paragraph) => paragraph.semanticId)
      .map((paragraph) => [paragraph.semanticId!, paragraph.text])
  );
  let paragraphIndex = 0;
  for (const block of document.blocks) {
    if (block.type === 'divider') {
      paragraphIndex += 1;
      continue;
    }
    let actual = paragraphs.get(block.id);
    if (actual === undefined && flowStoryId) {
      if (block.type === 'image') {
        paragraphIndex += 1;
        if ((block.caption ?? []).length) actual = mainStory.paragraphs[paragraphIndex]?.text;
        paragraphIndex += (block.caption ?? []).length ? 1 : 0;
      } else {
        actual = mainStory.paragraphs[paragraphIndex]?.text;
        paragraphIndex += 1;
      }
    }
    const expected =
      block.type === 'image'
        ? (block.caption ?? []).map((run) => run.text).join('')
        : block.content.map((run) => run.text).join('');
    if (expected && actual !== expected)
      diagnostics.push({
        code: 'Document.TextChanged',
        message: `Text from ${block.id} did not survive the InDesign save and reopen check.`,
        severity: 'warning',
        path: block.id
      });
  }
  if (document.metadata.subtitle) {
    const subtitleFrame = dump.frames.find((frame) => frame.semanticRole === 'hero-subtitle');
    if (!subtitleFrame || subtitleFrame.text !== document.metadata.subtitle)
      diagnostics.push({
        code: 'Document.CoverSubtitleChanged',
        message: 'The cover subtitle did not survive the InDesign save and reopen check.',
        severity: 'warning'
      });
  }
  if (dump.missingAssets.length)
    diagnostics.push({
      code: 'Asset.Missing',
      message: `InDesign reported ${dump.missingAssets.length} missing linked asset(s).`,
      severity: 'warning'
    });
  if (dump.missingFonts.length)
    diagnostics.push({
      code: 'Font.Missing',
      message: `InDesign reported ${dump.missingFonts.length} missing or substituted font(s).`,
      severity: 'warning'
    });
  return diagnostics;
}
