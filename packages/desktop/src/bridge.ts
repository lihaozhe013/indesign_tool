import { invoke } from "@tauri-apps/api/core";
import type { HostJob, HostJobResult } from "@publisher/contracts";

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
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" | "info"; path?: string }>;
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
  pdfPath: string;
  previewDirectory: string;
}

export function openMarkdown(): Promise<OpenedTextFile | null> {
  return invoke("open_markdown");
}

export function saveMarkdown(path: string | null, content: string): Promise<string | null> {
  return invoke("save_markdown", { path, content });
}

export function chooseTemplate(): Promise<string | null> {
  return invoke("choose_template");
}

export function chooseOutput(): Promise<string | null> {
  return invoke("choose_output");
}

export function checkHost(): Promise<HostAvailability> {
  return invoke("check_host");
}

export function runHostJob(job: HostJob): Promise<HostJobResult> {
  return invoke("run_host_job", { job });
}

export function readPreview(path: string): Promise<string> {
  return invoke("read_preview", { path });
}

export function openOutput(path: string): Promise<void> {
  return invoke("open_output", { path });
}

export function checkAssets(articlePath: string, sources: string[]): Promise<AssetCheck> {
  return invoke("check_assets", { articlePath, sources });
}

export function prepareOutputStage(outputPath: string): Promise<OutputStage> {
  return invoke("prepare_output_stage", { outputPath });
}

export function finalizeOutputStage(outputPath: string, stageId: string, expectedPages: number): Promise<OutputPaths> {
  return invoke("finalize_output_stage", { outputPath, stageId, expectedPages });
}

export function discardOutputStage(outputPath: string, stageId: string): Promise<void> {
  return invoke("discard_output_stage", { outputPath, stageId });
}
