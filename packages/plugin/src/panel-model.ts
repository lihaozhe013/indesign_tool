import type { Diagnostic, SemanticBlock } from '@folio/contracts';
import type { ParseArticleResult } from '@folio/core';

export interface PanelBlockPreview {
  id: string;
  type: string;
  label: string;
  preview: string;
}

export interface PanelValidationModel {
  state: 'valid' | 'warning' | 'error';
  status: string;
  title: string;
  byline: string;
  blockCount: number;
  errorCount: number;
  warningCount: number;
  blocks: PanelBlockPreview[];
  diagnostics: Diagnostic[];
}

export function createPanelValidationModel(result: ParseArticleResult): PanelValidationModel {
  const diagnostics = result.diagnostics;
  const errors = diagnostics.filter((item) => item.severity === 'error').length;
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length;
  const state = errors ? 'error' : warnings ? 'warning' : 'valid';
  const document = result.document;

  return {
    state,
    status: errors
      ? `${errors} error${errors === 1 ? '' : 's'}`
      : warnings
        ? `${warnings} warning${warnings === 1 ? '' : 's'}`
        : 'Structure looks good',
    title: document?.metadata.title ?? 'No article preview',
    byline: document
      ? [document.metadata.author, document.metadata.subtitle].filter(Boolean).join(' · ')
      : '',
    blockCount: document?.blocks.length ?? 0,
    errorCount: errors,
    warningCount: warnings,
    blocks: document?.blocks.map(toPreview) ?? [],
    diagnostics
  };
}

function toPreview(block: SemanticBlock): PanelBlockPreview {
  if (block.type === 'heading') {
    return {
      id: block.id,
      type: `H${block.level}`,
      label: `Heading ${block.level}`,
      preview: text(block.content)
    };
  }
  if (block.type === 'image') {
    const caption = text(block.caption ?? []);
    return {
      id: block.id,
      type: 'Image',
      label: 'Image',
      preview: caption || block.alt || block.src
    };
  }
  if (block.type === 'divider')
    return { id: block.id, type: 'Rule', label: 'Divider', preview: 'Section divider' };
  if (block.type === 'quote')
    return { id: block.id, type: 'Quote', label: 'Quote', preview: text(block.content) };
  return { id: block.id, type: 'Text', label: 'Paragraph', preview: text(block.content) };
}

function text(runs: Array<{ text: string }>): string {
  return runs
    .map((run) => run.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
