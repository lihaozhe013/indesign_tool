import type {
  CompiledTemplate,
  DocumentDump,
  DocumentIR,
  HostAdapter,
  HostJob,
  HostJobHandler,
  HostJobQueue,
  HostJobResult,
  HostObservation,
  SemanticDocument,
  TemplateInventory
} from "@publisher/contracts";

export interface IndesignDriver {
  inspectTemplate(templatePath: string): Promise<TemplateInventory>;
  render(input: {
    templatePath: string;
    outputPath: string;
    document: SemanticDocument;
    template: CompiledTemplate;
    ir: DocumentIR;
    mode: "create" | "appendPages";
  }): Promise<HostObservation>;
  dump(documentPath: string): Promise<DocumentDump>;
  export(documentPath: string, outputPath: string, format: "pdf" | "png" | "jpeg"): Promise<void>;
}

export function createIndesignAdapter(driver: IndesignDriver): HostAdapter {
  return {
    inspectTemplate: (templatePath) => run("inspectTemplate", () => driver.inspectTemplate(templatePath)),
    render: (input) => run("render", () => driver.render(input)),
    dump: async (documentPath) => canonicalizeDocumentDump(await run("dump", () => driver.dump(documentPath))),
    export: (documentPath, outputPath, format) => run("export", () => driver.export(documentPath, outputPath, format))
  };
}

export class HostOperationError extends Error {
  readonly operation: string;
  readonly causeValue: unknown;

  constructor(operation: string, causeValue: unknown) {
    super("InDesign host operation failed: " + operation);
    this.name = "HostOperationError";
    this.operation = operation;
    this.causeValue = causeValue;
  }
}

export async function processPendingJobs(
  queue: HostJobQueue,
  handler: HostJobHandler
): Promise<HostJobResult[]> {
  const jobs = await queue.listPending();
  const jobIds = new Set<string>();
  for (const job of jobs) {
    if (jobIds.has(job.jobId)) throw new Error("Queue contains duplicate job ID: " + job.jobId);
    jobIds.add(job.jobId);
  }
  const results: HostJobResult[] = [];

  for (const job of jobs) {
    let result: HostJobResult;
    try {
      result = {
        schemaVersion: 1,
        jobId: job.jobId,
        status: "succeeded",
        diagnostics: [],
        payload: await handler(job)
      };
    } catch (error) {
      result = failedJob(job, "HostJob.ExecutionFailed", errorMessage(error));
    }

    await queue.writeResult(result);
    await queue.removePending(job.jobId);
    results.push(result);
  }
  return results;
}

function failedJob(job: HostJob, code: string, message: string): HostJobResult {
  return {
    schemaVersion: 1,
    jobId: job.jobId,
    status: "failed",
    diagnostics: [{ code, message, severity: "error" }]
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function canonicalizeDocumentDump(dump: DocumentDump): DocumentDump {
  return {
    schemaVersion: 1,
    pages: [...dump.pages]
      .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
      .map((page) => ({ ...page })),
    stories: [...dump.stories]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((story) => ({
        id: story.id,
        overset: story.overset,
        paragraphs: story.paragraphs.map((paragraph) => ({ ...paragraph }))
      })),
    frames: dump.frames.map((frame) => ({
      ...frame,
      ...(frame.bounds ? { bounds: frame.bounds.map(roundMeasurement) as [number, number, number, number] } : {})
    })).sort((left, right) =>
      (left.pageIndex ?? Number.MAX_SAFE_INTEGER) - (right.pageIndex ?? Number.MAX_SAFE_INTEGER)
      || (left.semanticRole ?? "").localeCompare(right.semanticRole ?? "")
    ),
    missingAssets: [...new Set(dump.missingAssets)].sort(),
    missingFonts: [...new Set(dump.missingFonts)].sort()
  };
}

async function run<T>(operation: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new HostOperationError(operation, error);
  }
}

function roundMeasurement(value: number): number {
  return Math.round(value * 100) / 100;
}
