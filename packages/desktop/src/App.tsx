import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CompiledTemplate,
  Diagnostic,
  DocumentDump,
  HostJob,
  HostJobResult,
  SemanticDocument,
  TemplateInventory,
  TemplateScan
} from "@publisher/contracts";
import { createIndesignAdapter, planHostOperations } from "@publisher/indesign";
import { parseArticle, publishDocument } from "@publisher/core";
import { compileTemplate, createTemplateInventory, deriveRoleAssignments } from "@publisher/template";
import { verifyDocumentDump } from "./publication-verification.js";
import {
  checkAssets,
  checkHost,
  chooseOutput,
  chooseTemplate,
  discardOutputStage,
  finalizeOutputStage,
  openMarkdown,
  openOutput,
  prepareOutputStage,
  readPreview,
  runHostJob,
  saveMarkdown
} from "./bridge.js";
import type { HostAvailability, OutputPaths, OutputStage } from "./bridge.js";

const starterArticle = `---
title: A field guide to better pages
subtitle: Clear structure for busy teams
author: Editorial Studio
language: en
---

# A field guide to better pages

A good document starts with a clear story. This sample is ready to edit, or open an existing Markdown article from your computer.

## Build a useful rhythm

Use short sections, direct language, and enough detail for the reader to act. **Emphasis** and [links](https://example.com) carry through to InDesign character styles.

> A strong page gives every idea room to breathe.

## Bring in an image

Add an image as a standalone Markdown paragraph with a local relative path and an optional caption. The generated INDD stays editable, and InDesign reports when a local image or font needs attention.
`;

type TemplateState = {
  scan: TemplateScan;
  inventory: TemplateInventory;
  compiled: CompiledTemplate;
  diagnostics: Diagnostic[];
};

type Notice = { kind: "success" | "error" | "info"; text: string };

export function App() {
  const [markdown, setMarkdown] = useState(starterArticle);
  const [articlePath, setArticlePath] = useState<string | null>(null);
  const [savedMarkdown, setSavedMarkdown] = useState<string | null>(null);
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateState | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [host, setHost] = useState<HostAvailability>({ available: false, message: "Checking InDesign…" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [output, setOutput] = useState<OutputPaths | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(1);
  const [outputPageCount, setOutputPageCount] = useState(0);

  const parsed = useMemo(() => parseArticle(markdown, { sourceId: articlePath ?? "desktop-draft" }), [markdown, articlePath]);
  const dirty = savedMarkdown !== null ? markdown !== savedMarkdown : Boolean(articlePath);
  const title = parsed.document?.metadata.title ?? "Untitled article";
  const missingSubtitleFrame = Boolean(parsed.document?.metadata.subtitle && template && !template.compiled.frameRoles["hero-subtitle"]);
  const templateReady = Boolean(template && !missingSubtitleFrame && !template.diagnostics.some((item) => item.severity === "error"));

  const refreshHost = useCallback(async () => {
    setHost({ available: false, message: "Checking InDesign…" });
    try {
      setHost(await checkHost());
    } catch (error) {
      setHost({ available: false, message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void refreshHost();
  }, [refreshHost]);

  useEffect(() => {
    const subtitleDiagnostics: Diagnostic[] = missingSubtitleFrame ? [{
      code: "Template.CoverSubtitleFrameMissing",
      message: "Add a text frame labeled with role hero-subtitle to the Cover page, or remove the article subtitle.",
      severity: "error",
      path: "frameRoles.hero-subtitle"
    }] : [];
    setDiagnostics(deduplicateDiagnostics([...parsed.diagnostics, ...(template?.diagnostics ?? []), ...subtitleDiagnostics]));
  }, [missingSubtitleFrame, parsed, template]);

  const handleOpenMarkdown = useCallback(async () => {
    try {
      const opened = await openMarkdown();
      if (!opened) return;
      setArticlePath(opened.path);
      setMarkdown(opened.content);
      setSavedMarkdown(opened.content);
      setDiagnostics([]);
      setNotice({ kind: "info", text: `Opened ${fileName(opened.path)}.` });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, []);

  const handleSaveMarkdown = useCallback(async (): Promise<string | null> => {
    try {
      const path = await saveMarkdown(articlePath, markdown);
      if (!path) return null;
      setArticlePath(path);
      setSavedMarkdown(markdown);
      setNotice({ kind: "success", text: `Saved ${fileName(path)}.` });
      return path;
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
      return null;
    }
  }, [articlePath, markdown]);

  const inspectTemplate = useCallback(async (path: string) => {
    setBusy(true);
    setProgress("Inspecting labeled template…");
    setTemplatePath(path);
    setTemplate(null);
    setDiagnostics([]);
    try {
      const result = await invokeHost("inspectTemplate", { templatePath: path });
      const scan = result.scan as TemplateScan | undefined;
      if (!scan) throw new Error("InDesign did not return a template scan.");
      const name = fileStem(path);
      const assignments = deriveRoleAssignments(scan, { templateId: templateId(path), name });
      const inventoryResult = assignments.assignments
        ? createTemplateInventory(scan, assignments.assignments)
        : { diagnostics: assignments.diagnostics, inventory: undefined };
      const compilation = inventoryResult.inventory ? compileTemplate(inventoryResult.inventory) : { diagnostics: [] as Diagnostic[], template: undefined };
      const resultDiagnostics = [...assignments.diagnostics, ...inventoryResult.diagnostics, ...compilation.diagnostics];
      if (compilation.template && !compilation.template.frameRoles["hero-title"]) {
        resultDiagnostics.push({
          code: "Template.CoverTitleFrameMissing",
          message: "Add a text frame labeled with role hero-title to the Cover page.",
          severity: "error",
          path: "frameRoles.hero-title"
        });
      }
      if (!inventoryResult.inventory || !compilation.template) {
        setDiagnostics(deduplicateDiagnostics(resultDiagnostics));
        setNotice({ kind: "error", text: "The template needs labeled Cover and Article roles, an article flow frame, and the required paragraph styles." });
        return;
      }
      setTemplate({ scan, inventory: inventoryResult.inventory, compiled: compilation.template, diagnostics: deduplicateDiagnostics(resultDiagnostics) });
      setDiagnostics(deduplicateDiagnostics(resultDiagnostics));
      if (resultDiagnostics.some((item) => item.severity === "error")) {
        setNotice({ kind: "error", text: "The template scan completed with issues." });
      } else {
        setNotice({ kind: "success", text: `Template ready: ${inventoryResult.inventory.name}.` });
      }
    } catch (error) {
      const message = errorMessage(error);
      setDiagnostics([{ code: "Template.InspectionFailed", message, severity: "error" }]);
      setNotice({ kind: "error", text: message });
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, []);

  const handleChooseTemplate = useCallback(async () => {
    try {
      const path = await chooseTemplate();
      if (path) await inspectTemplate(path);
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, [inspectTemplate]);

  const handleChooseOutput = useCallback(async () => {
    try {
      const path = await chooseOutput();
      if (path) {
        setOutputPath(path);
        setOutput(null);
        setPreview(null);
      }
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, []);

  const handlePublish = useCallback(async () => {
    const initialDiagnostics = parsed.diagnostics;
    setDiagnostics(initialDiagnostics);
    setOutput(null);
    setPreview(null);
    if (!parsed.document || initialDiagnostics.some((item) => item.severity === "error")) {
      setNotice({ kind: "error", text: "Fix the Markdown issues before publishing." });
      return;
    }
    if (!template || !templateReady || !templatePath) {
      setNotice({ kind: "error", text: "Choose and inspect a labeled InDesign template first." });
      return;
    }
    if (!host.available) {
      setNotice({ kind: "error", text: host.message ?? "InDesign is unavailable." });
      return;
    }

    setBusy(true);
    let stage: OutputStage | null = null;
    let finalOutputPath = outputPath;
    try {
      setProgress("Saving article and checking image files…");
      const savedPath = await saveMarkdown(articlePath, markdown);
      if (!savedPath) throw new Error("Publishing needs a saved Markdown article.");
      setArticlePath(savedPath);
      setSavedMarkdown(markdown);

      const localSources = parsed.document.blocks.filter((block) => block.type === "image").map((block) => block.src);
      const assetResult = await checkAssets(savedPath, localSources);
      const resolvedDocument = resolveArticleAssets(parsed.document, assetResult.resolved);
      const readyDiagnostics = deduplicateDiagnostics([...initialDiagnostics, ...assetResult.diagnostics]);
      setDiagnostics(readyDiagnostics);
      if (readyDiagnostics.some((item) => item.severity === "error")) {
        setNotice({ kind: "error", text: "Resolve the listed image issues before publishing." });
        return;
      }

      if (!finalOutputPath) {
        finalOutputPath = await chooseOutput();
        if (!finalOutputPath) return;
        setOutputPath(finalOutputPath);
      }
      stage = await prepareOutputStage(finalOutputPath);
      setProgress("Building the editable InDesign document…");

      let renderCount = 0;
      const adapter = createIndesignAdapter({
        inspectTemplate: async () => template.inventory,
        render: async (input) => {
          renderCount += 1;
          setProgress(renderCount === 1 ? "Composing text and placing images…" : `Adding pages and recomposing… (${renderCount})`);
          const hostPlan = planHostOperations(input.document, input.template, input.ir);
          if (!hostPlan.plan || hostPlan.diagnostics.some((item) => item.severity === "error")) {
            throw new Error(hostPlan.diagnostics.map((item) => item.message).join("\n") || "Could not create the InDesign layout plan.");
          }
          const result = await invokeHost("render", {
            templatePath: input.templatePath,
            outputPath: input.outputPath,
            document: input.document,
            template: input.template,
            ir: input.ir,
            mode: input.mode,
            operations: hostPlan.plan.operations,
            story: hostPlan.plan.story
          });
          if (!result.observation) throw new Error("InDesign did not return layout observations.");
          return result.observation as {
            pageCount: number;
            overset: Array<{ storyId: string; pageId: string; frameRef: string; remainingCharacters?: number }>;
            missingAssets: string[];
            missingFonts: string[];
          };
        },
        dump: async (documentPath) => {
          setProgress("Checking the saved document structure…");
          const result = await invokeHost("dump", { documentPath });
          if (!result.documentDump) throw new Error("InDesign did not return a document structure.");
          return result.documentDump as DocumentDump;
        },
        export: async (documentPath, destination, format) => {
          const result = await invokeHost("export", { documentPath, outputPath: destination, format, pageNumber: 1 });
          if (!result.outputPath) throw new Error("InDesign did not confirm the export path.");
        }
      });

      const published = await publishDocument(adapter, {
        templatePath,
        outputPath: stage.documentPath,
        document: resolvedDocument,
        template: template.compiled
      });
      const publishDiagnostics = published.diagnostics;
      if (!published.complete || !published.ir) {
        setDiagnostics(deduplicateDiagnostics([...readyDiagnostics, ...publishDiagnostics]));
        setNotice({ kind: "error", text: "InDesign could not finish layout. The staged files were discarded." });
        return;
      }

      setProgress("Verifying the editable document…");
      const dump = await adapter.dump(stage.documentPath);
      const verification = verifyDocumentDump(dump, resolvedDocument);
      if (verification.some((item) => item.severity === "error")) {
        setDiagnostics(deduplicateDiagnostics([...readyDiagnostics, ...publishDiagnostics, ...verification]));
        setNotice({ kind: "error", text: "Document verification failed. The staged files were discarded." });
        return;
      }
      const pageCount = dump.pages.length;
      if (!pageCount) throw new Error("InDesign created a document with no pages.");

      setProgress("Exporting PDF…");
      await invokeHost("export", { documentPath: stage.documentPath, outputPath: stage.pdfPath, format: "pdf" });
      for (let page = 1; page <= pageCount; page += 1) {
        setProgress(`Creating page previews… (${page}/${pageCount})`);
        const previewPath = joinPath(stage.previewDirectory, `page-${String(page).padStart(3, "0")}.png`);
        await invokeHost("export", { documentPath: stage.documentPath, outputPath: previewPath, format: "png", pageNumber: page });
      }

      setProgress("Finalizing deliverables…");
      const finalFiles = await finalizeOutputStage(finalOutputPath, stage.stageId, pageCount);
      stage = null;
      setOutput(finalFiles);
      setOutputPageCount(pageCount);
      setPreviewIndex(1);
      setPreview(await readPreview(joinPath(finalFiles.previewDirectory, "page-001.png")));
      setDiagnostics(deduplicateDiagnostics([...readyDiagnostics, ...publishDiagnostics, ...verification]));
      setNotice({ kind: "success", text: `Published ${fileName(finalFiles.documentPath)} with ${pageCount} pages.` });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
      setDiagnostics((current) => deduplicateDiagnostics([...current, { code: "Publish.Failed", message: errorMessage(error), severity: "error" }]));
    } finally {
      if (stage && finalOutputPath) {
        try {
          await discardOutputStage(finalOutputPath, stage.stageId);
        } catch (cleanupError) {
          setDiagnostics((current) => deduplicateDiagnostics([...current, {
            code: "Output.StageCleanupFailed",
            message: `Could not remove the incomplete staging folder: ${errorMessage(cleanupError)}`,
            severity: "warning"
          }]));
        }
      }
      setBusy(false);
      setProgress("");
    }
  }, [articlePath, host, markdown, outputPath, parsed, template, templatePath, templateReady]);

  const showPreview = useCallback(async (index: number) => {
    if (!output || index < 1 || index > outputPageCount) return;
    setPreviewIndex(index);
    try {
      setPreview(await readPreview(joinPath(output.previewDirectory, `page-${String(index).padStart(3, "0")}.png`)));
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, [output, outputPageCount]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="brand-name">Folio</div>
            <div className="brand-caption">STRUCTURED PUBLISHING</div>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <button className="side-link active" type="button"><span className="side-icon">▤</span> Publish article</button>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">CURRENT ARTICLE</div>
        <div className="article-card">
          <div className="article-card-icon">MD</div>
          <div className="article-card-copy">
            <div className="article-card-title">{title}</div>
            <div className="article-card-meta">{articlePath ? fileName(articlePath) : "Unsaved draft"}</div>
          </div>
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
        <div className="sidebar-footer">
          <div className={`host-indicator ${host.available ? "online" : "offline"}`}>
            <span className="status-dot" />
            <span>{host.available ? `InDesign ${host.version ?? "ready"}` : "InDesign unavailable"}</span>
          </div>
          <button className="text-button sidebar-host-refresh" type="button" onClick={() => void refreshHost()}>Refresh connection</button>
          <div className="sidebar-version">Folio Desktop · 0.1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-separator">/</span><strong>Publish article</strong></div>
          <div className="topbar-actions">
            <button className="button quiet" type="button" onClick={() => void handleOpenMarkdown()} disabled={busy}>Open Markdown</button>
            <button className="button quiet" type="button" onClick={() => void handleSaveMarkdown()} disabled={busy}>Save draft</button>
          </div>
        </header>

        <div className="content-scroll">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PUBLISHING WORKFLOW <span className="eyebrow-line" /></div>
              <h1>Turn your story into pages.</h1>
              <p className="page-subtitle">Write in Markdown. Let InDesign handle the composition.</p>
            </div>
            <div className="heading-badge"><span className="badge-spark">✳</span> INDD · PDF · PNG</div>
          </div>

          {notice && <div className={`notice ${notice.kind}`} role="status"><span className="notice-icon">{notice.kind === "success" ? "✓" : notice.kind === "error" ? "!" : "i"}</span><span>{notice.text}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

          <div className="workflow-grid">
            <section className="editor-panel panel">
              <div className="panel-heading editor-heading">
                <div className="panel-title-group"><span className="step-number">01</span><div><h2>Article source</h2><p>Write or open a Markdown file</p></div></div>
                <div className={`file-state ${dirty ? "changed" : "saved"}`}><span className="file-state-dot" />{dirty ? "Unsaved changes" : articlePath ? "Saved" : "New draft"}</div>
              </div>
              <div className="editor-toolbar"><span className="markdown-chip">M↓</span><span>MARKDOWN</span><span className="toolbar-divider" /><span className="editor-file-name">{articlePath ? fileName(articlePath) : "untitled-article.md"}</span><span className="editor-toolbar-spacer" /><span className="line-count">{markdown.split("\n").length} lines</span></div>
              <textarea
                className="markdown-editor"
                aria-label="Markdown article"
                value={markdown}
                spellCheck={false}
                onChange={(event) => setMarkdown(event.target.value)}
                disabled={busy}
              />
              <div className="editor-footer"><span><span className="footer-dot" /> Markdown source</span><span>{parsed.document ? `${parsed.document.blocks.length} content blocks` : "Fix parse errors to continue"}</span></div>
            </section>

            <div className="workflow-side">
              <section className="setup-card panel">
                <div className="panel-heading">
                  <div className="panel-title-group"><span className="step-number">02</span><div><h2>InDesign template</h2><p>Choose a role-labeled .indd file</p></div></div>
                  <span className={`step-check ${templateReady ? "complete" : ""}`}>{templateReady ? "✓" : "2"}</span>
                </div>
                <button className={`selection-row ${template ? "selected" : ""}`} type="button" onClick={() => void handleChooseTemplate()} disabled={busy}>
                  <span className="file-icon indesign">Id</span>
                  <span className="selection-copy"><strong>{template ? fileName(templatePath ?? "") : "Select a template"}</strong><small>{template ? `${template.scan.document.pageCount} pages · ${template.scan.styles.length} styles scanned` : "Your original file stays untouched"}</small></span>
                  <span className="selection-action">{template ? "Change" : "Browse"}</span>
                </button>
                {template && <div className={`template-result ${templateReady ? "ready" : "needs-attention"}`}><span className="result-icon">{templateReady ? "✓" : "!"}</span><span>{templateReady ? `${template.compiled.name} is ready to publish` : "Review template issues below"}</span></div>}
              </section>

              <section className="setup-card panel output-card">
                <div className="panel-heading">
                  <div className="panel-title-group"><span className="step-number">03</span><div><h2>Output location</h2><p>Choose a new editable document path</p></div></div>
                  <span className={`step-check ${outputPath ? "complete" : ""}`}>{outputPath ? "✓" : "3"}</span>
                </div>
                <button className={`selection-row ${outputPath ? "selected" : ""}`} type="button" onClick={() => void handleChooseOutput()} disabled={busy}>
                  <span className="file-icon folder">↗</span>
                  <span className="selection-copy"><strong>{outputPath ? fileName(outputPath) : "Choose output file"}</strong><small>{outputPath ? parentPath(outputPath) : "A PDF and page previews are included"}</small></span>
                  <span className="selection-action">{outputPath ? "Change" : "Browse"}</span>
                </button>
              </section>

              <section className="publish-card">
                <div className="publish-card-top"><div className="publish-orb"><span>✳</span></div><div><strong>Ready when you are</strong><small>InDesign will create an editable copy of your template.</small></div></div>
                <button className="publish-button" type="button" onClick={() => void handlePublish()} disabled={busy || !parsed.document || !templateReady || !host.available}>
                  <span>{busy ? "Working…" : "Publish article"}</span><span className="publish-arrow">{busy ? "···" : "↗"}</span>
                </button>
                {busy ? <div className="progress-line"><span className="progress-spinner" />{progress || "Working with InDesign…"}</div> : <div className="publish-hint">Creates a fresh INDD, PDF, and page previews</div>}
              </section>
            </div>
          </div>

          <section className="results-grid">
            <div className="diagnostics-panel panel">
              <div className="results-heading"><div><span className="section-overline">PREFLIGHT</span><h2>Checks &amp; issues</h2></div><span className={`issue-count ${diagnostics.some((item) => item.severity === "error") ? "has-errors" : ""}`}>{diagnostics.filter((item) => item.severity === "error").length} errors · {diagnostics.filter((item) => item.severity === "warning").length} warnings</span></div>
              {diagnostics.length ? <div className="diagnostic-list">{diagnostics.map((item, index) => <DiagnosticRow key={`${item.code}-${item.path ?? index}`} diagnostic={item} />)}</div> : <div className="empty-checks"><span className="checks-mark">✓</span><div><strong>No issues found yet</strong><span>Markdown and template checks will appear here.</span></div></div>}
            </div>

            <div className="preview-panel panel">
              <div className="results-heading preview-heading"><div><span className="section-overline">OUTPUT PREVIEW</span><h2>{output ? "Generated pages" : "Page preview"}</h2></div>{output && <button className="text-button" type="button" onClick={() => void openOutput(output.documentPath)}>Open INDD ↗</button>}</div>
              <div className={`preview-stage ${preview ? "has-preview" : ""}`}>
                {preview ? <img src={preview} alt={`Preview of page ${previewIndex}`} /> : <div className="preview-placeholder"><div className="paper-preview"><span /><span /><span /><i /></div><div className="preview-placeholder-copy"><strong>Your pages will appear here</strong><span>Publish to see the InDesign composition.</span></div></div>}
              </div>
              {output ? <div className="preview-controls"><button type="button" aria-label="Previous page" onClick={() => void showPreview(Math.max(1, previewIndex - 1))} disabled={previewIndex <= 1}>‹</button><span>Page <strong>{previewIndex}</strong> of {outputPageCount}</span><button type="button" aria-label="Next page" onClick={() => void showPreview(Math.min(outputPageCount, previewIndex + 1))} disabled={previewIndex >= outputPageCount}>›</button><span className="preview-control-spacer" /><button className="open-pdf-button" type="button" onClick={() => void openOutput(output.pdfPath)}>Open PDF ↗</button></div> : <div className="preview-meta"><span>InDesign composition</span><span>·</span><span>Live export</span></div>}
            </div>
          </section>

          <footer className="content-footer"><span>Folio keeps InDesign as the source of truth for typography and page composition.</span><span>LOCAL WORKSPACE <i /></span></footer>
        </div>
      </main>
    </div>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  return <div className={`diagnostic-row ${diagnostic.severity}`}><span className="diagnostic-marker">{diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}</span><div><strong>{diagnostic.message}</strong>{diagnostic.path && <small>{diagnostic.path}</small>}</div><span className="diagnostic-code">{diagnostic.code}</span></div>;
}

async function invokeHost(action: HostJob["action"], payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const job: HostJob = { schemaVersion: 1, jobId: crypto.randomUUID(), action, payload };
  const result: HostJobResult = await runHostJob(job);
  if (result.status !== "succeeded") {
    const messages = result.diagnostics.map((item) => item.message).filter(Boolean);
    throw new Error(messages.join("\n") || `InDesign operation failed: ${action}.`);
  }
  return result.payload ?? {};
}

function resolveArticleAssets(document: SemanticDocument, resolved: Record<string, string>): SemanticDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => block.type === "image" && resolved[block.src]
      ? { ...block, src: resolved[block.src]! }
      : block)
  };
}

function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((item) => {
    const key = `${item.code}\u0000${item.path ?? ""}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function fileStem(path: string): string {
  const name = fileName(path);
  const extension = name.lastIndexOf(".");
  return extension > 0 ? name.slice(0, extension) : name;
}

function templateId(path: string): string {
  const normalized = fileStem(path).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let hash = 2166136261;
  for (const character of path) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${normalized || "indesign-template"}-${(hash >>> 0).toString(16)}`;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : path;
}

function joinPath(directory: string, name: string): string {
  return `${directory.replace(/\/$/, "")}/${name}`;
}
