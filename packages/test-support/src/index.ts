import type {
  CompiledTemplate,
  DocumentDump,
  DocumentIR,
  HostAdapter,
  HostObservation,
  SemanticDocument,
  TemplateInventory
} from "@folio/contracts";

export class FakeHostAdapter implements HostAdapter {
  readonly operations: string[] = [];

  constructor(
    private readonly inventory: TemplateInventory,
    private readonly observations: HostObservation[] = [],
    private readonly dumpValue: DocumentDump = {
      schemaVersion: 1,
      pages: [],
      stories: [],
      frames: [],
      missingAssets: [],
      missingFonts: []
    }
  ) {}

  async inspectTemplate(_templatePath: string): Promise<TemplateInventory> {
    this.operations.push("inspectTemplate");
    return this.inventory;
  }

  async render(input: {
    templatePath: string;
    outputPath: string;
    document: SemanticDocument;
    template: CompiledTemplate;
    ir: DocumentIR;
    mode: "create" | "appendPages";
  }): Promise<HostObservation> {
    this.operations.push("render:" + input.mode + ":" + input.ir.pages.length);
    return this.observations.shift() ?? {
      pageCount: input.ir.pages.length,
      overset: [],
      missingAssets: [],
      missingFonts: []
    };
  }

  async dump(_documentPath: string): Promise<DocumentDump> {
    this.operations.push("dump");
    return this.dumpValue;
  }

  async export(_documentPath: string, _outputPath: string, format: "pdf" | "png" | "jpeg"): Promise<void> {
    this.operations.push("export:" + format);
  }
}

export function makeInventory(): TemplateInventory {
  return {
    schemaVersion: 1,
    templateId: "fixture-editorial-blue",
    name: "Editorial Blue",
    pages: [
      { ref: "cover-page", name: "Cover", source: "page", role: "Cover" },
      { ref: "article-page", name: "Article", source: "parentPage", role: "Article" },
      { ref: "ending-page", name: "Ending", source: "page", role: "Ending" }
    ],
    frames: [
      { ref: "article-flow-frame", pageRef: "article-page", name: "Main flow", role: "article-flow", kind: "text" }
    ],
    styles: [
      { kind: "paragraph", name: "ArticleTitle", qualifiedName: "Editorial / ArticleTitle" },
      { kind: "paragraph", name: "SectionHeading", qualifiedName: "Editorial / SectionHeading" },
      { kind: "paragraph", name: "Body", qualifiedName: "Editorial / Body" },
      { kind: "paragraph", name: "Quote", qualifiedName: "Editorial / Quote" },
      { kind: "paragraph", name: "Caption", qualifiedName: "Editorial / Caption" },
      { kind: "character", name: "Emphasis", qualifiedName: "Editorial / Emphasis" },
      { kind: "object", name: "InlineImage", qualifiedName: "Editorial / InlineImage" },
      { kind: "object", name: "HeroImage", qualifiedName: "Editorial / HeroImage" }
    ],
    requiredAssets: []
  };
}

export function fakeObservation(overrides: Partial<HostObservation> = {}): HostObservation {
  return {
    pageCount: 2,
    overset: [],
    missingAssets: [],
    missingFonts: [],
    ...overrides
  };
}
