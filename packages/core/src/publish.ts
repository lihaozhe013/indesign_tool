import type {
  CompiledTemplate,
  Diagnostic,
  DocumentIR,
  HostAdapter,
  HostObservation,
  SemanticDocument
} from "@publisher/contracts";
import { planDocument, respondToObservation } from "./planner.js";

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
  if (!planned.ir) return { diagnostics: planned.diagnostics, complete: false };

  let ir = planned.ir;
  let diagnostics = [...planned.diagnostics];
  let observation = await host.render({ ...input, ir, mode: "create" });
  const maxPages = options.maxPages ?? 500;

  while (true) {
    const response = respondToObservation(ir, input.template, observation, { maxPages });
    diagnostics = deduplicateDiagnostics([...diagnostics, ...response.diagnostics]);
    ir = response.ir;
    if (response.complete) return { ir, observation, diagnostics, complete: true };
    if (!response.addedPages || diagnostics.some((item) => item.severity === "error")) {
      return { ir, observation, diagnostics, complete: false };
    }
    observation = await host.render({ ...input, ir, mode: "appendPages" });
  }
}

function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [diagnostic.code, diagnostic.path ?? "", diagnostic.message].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
