import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Diagnostic, HostJob, HostJobResult } from '@folio/contracts';
import { LOCALE_CHANGED_EVENT, type Locale } from './i18n/locale.js';

export interface OpenedTextFile {
  path: string;
  content: string;
}

export interface HostAvailability {
  available: boolean;
  version?: string;
  message?: string;
}

export interface AssetCheck {
  resolved: Record<string, string>;
  diagnostics: Array<{
    code: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    path?: string;
  }>;
}

export interface OutputStage {
  stageId: string;
  documentPath: string;
  pdfPath: string;
  previewDirectory: string;
  finalDocumentPath: string;
  finalPdfPath: string;
  finalPreviewDirectory: string;
}

export interface OutputPaths {
  documentPath: string;
  pdfPath: string | null;
  previewDirectory: string | null;
  previewPages: number[];
  reportPath: string;
  finalizationWarnings: string[];
}

export function openMarkdown(): Promise<OpenedTextFile | null> {
  return invoke('open_markdown');
}

export function saveMarkdown(path: string | null, content: string): Promise<string | null> {
  return invoke('save_markdown', { path, content });
}

export function chooseTemplate(): Promise<string | null> {
  return invoke('choose_template');
}

export function chooseOutput(): Promise<string | null> {
  return invoke('choose_output');
}

export function checkHost(): Promise<HostAvailability> {
  return invoke('check_host');
}

export function runHostJob(job: HostJob): Promise<HostJobResult> {
  return invoke('run_host_job', { job });
}

export function readPreview(path: string): Promise<string> {
  return invoke('read_preview', { path });
}

export function readMarkdownImage(articlePath: string, source: string): Promise<string> {
  return invoke('read_markdown_image', { articlePath, source });
}

export function openOutput(path: string): Promise<void> {
  return invoke('open_output', { path });
}

export function checkAssets(articlePath: string, sources: string[]): Promise<AssetCheck> {
  return invoke('check_assets', { articlePath, sources });
}

export function prepareOutputStage(outputPath: string): Promise<OutputStage> {
  return invoke('prepare_output_stage', { outputPath });
}

export function finalizeOutputStage(
  outputPath: string,
  stageId: string,
  report: string,
  expectedPages: number
): Promise<OutputPaths> {
  return invoke('finalize_output_stage', { outputPath, stageId, report, expectedPages });
}

export function discardOutputStage(outputPath: string, stageId: string): Promise<void> {
  return invoke('discard_output_stage', { outputPath, stageId });
}

/**
 * Rust owns the stored preference so the native menu and the WebView cannot disagree.
 * Returns null until the user has chosen a locale.
 */
export function getStoredLocale(): Promise<Locale | null> {
  return invoke('get_locale');
}

export function setStoredLocale(locale: Locale): Promise<void> {
  return invoke('set_locale', { locale });
}

export function onLocaleChanged(handler: (locale: Locale) => void): Promise<UnlistenFn> {
  return listen<string>(LOCALE_CHANGED_EVENT, ({ payload }) => handler(payload as Locale));
}

const OUTPUT_UPDATED_EVENT = 'output-updated';
const REPORT_UPDATED_EVENT = 'report-updated';

export type AuxWindowKind = 'preview' | 'report';

/** Creates the auxiliary window, or brings it to the front when it is already open. */
export function openAuxWindow(kind: AuxWindowKind): Promise<void> {
  return invoke('open_aux_window', { kind });
}

/** Publishes the live diagnostic list to shared state so the report window can read it. */
export function rememberReport(diagnostics: Diagnostic[]): Promise<void> {
  return invoke('remember_report', { diagnostics });
}

export function getLastOutput(): Promise<OutputPaths | null> {
  return invoke('get_last_output');
}

export function getLastReport(): Promise<Diagnostic[]> {
  return invoke('get_last_report');
}

export function onOutputUpdated(
  handler: (output: OutputPaths | null) => void
): Promise<UnlistenFn> {
  return listen<OutputPaths | null>(OUTPUT_UPDATED_EVENT, ({ payload }) => handler(payload));
}

export function onReportUpdated(handler: (diagnostics: Diagnostic[]) => void): Promise<UnlistenFn> {
  return listen<Diagnostic[]>(REPORT_UPDATED_EVENT, ({ payload }) => handler(payload));
}
