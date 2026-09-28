import type {
  CompiledTemplate,
  Diagnostic,
  DocumentIR,
  HostAdapter,
  HostObservation,
  SemanticDocument
} from '@folio/contracts';
import { planDocument, respondToObservation } from './planner.js';

export interface PublishInput {
  templatePath: string;
  outputPath: string;
  document: SemanticDocument;
  template: CompiledTemplate;
}

export interface PublishOptions {
  maxPages?: number;
}

export interface PublishResult {
  status: 'complete' | 'degraded' | 'failed';
  ir?: DocumentIR;
  observation?: HostObservation;
  diagnostics: Diagnostic[];
  complete: boolean;
}

export async function publishDocument(
  host: HostAdapter,
  input: PublishInput,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const planned = planDocument(input.document, input.template);
  if (!planned.ir) return { status: 'failed', diagnostics: planned.diagnostics, complete: false };

  let ir = planned.ir;
  let diagnostics = [...planned.diagnostics];
  let observation: HostObservation;
  try {
    observation = await host.render({ ...input, ir, mode: 'create' });
  } catch (error) {
    diagnostics.push(hostFailure(error));
    return { status: 'failed', ir, diagnostics, complete: false };
  }
  const maxPages = options.maxPages ?? 500;

  while (true) {
    const response = respondToObservation(ir, input.template, observation, { maxPages });
    diagnostics = deduplicateDiagnostics([...diagnostics, ...response.diagnostics]);
    ir = response.ir;
    if (response.complete) {
      const failed = diagnostics.some((item) => item.severity === 'error');
      const degraded = diagnostics.some((item) => item.severity === 'warning');
      return {
        status: failed ? 'failed' : degraded ? 'degraded' : 'complete',
        ir,
        observation,
        diagnostics,
        complete: !failed
      };
    }
    if (!response.addedPages || diagnostics.some((item) => item.severity === 'error')) {
      return { status: 'failed', ir, observation, diagnostics, complete: false };
    }
    try {
      observation = await host.render({ ...input, ir, mode: 'appendPages' });
    } catch (error) {
      diagnostics.push(hostFailure(error));
      return { status: 'failed', ir, observation, diagnostics, complete: false };
    }
  }
}

function hostFailure(error: unknown): Diagnostic {
  const details = error instanceof Error ? error.message : String(error);
  return {
    code: 'Publish.HostOperationFailed',
    message: details,
    severity: 'error',
    context: { details }
  };
}

function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [diagnostic.code, diagnostic.path ?? '', diagnostic.message].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
