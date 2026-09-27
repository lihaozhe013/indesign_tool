import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  CompiledTemplate,
  Diagnostic,
  DocumentDump,
  HostJob,
  HostJobResult,
  SemanticDocument,
  TemplateInventory,
  TemplateScan
} from "@folio/contracts";
import { createIndesignAdapter, planHostOperations } from "@folio/indesign";
import { parseArticle, publishDocument } from "@folio/core";
import { compileTemplate, createTemplateInventory, deriveRoleAssignments } from "@folio/template";
import { applyDocumentLocale, supportedLocales, type Locale } from "./i18n/index.js";
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
  saveMarkdown,
  setStoredLocale
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

// Progress is stored as a key plus interpolation values rather than a rendered string so a
// language switch repaints the in-flight status instead of leaving it frozen in the old locale.
type Progress = { key: string; params?: Record<string, unknown> } | null;

export function App() {
  const { t, i18n } = useTranslation();
  const [markdown, setMarkdown] = useState(starterArticle);
  const [articlePath, setArticlePath] = useState<string | null>(null);
  const [savedMarkdown, setSavedMarkdown] = useState<string | null>(null);
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateState | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  // `null` means the first availability probe has not returned yet, which is distinct from a
  // probe that reported InDesign as unavailable.
  const [host, setHost] = useState<HostAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [output, setOutput] = useState<OutputPaths | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(1);
  const [outputPageCount, setOutputPageCount] = useState(0);

  const locale = (i18n.resolvedLanguage ?? i18n.language) as Locale;

  const parsed = useMemo(() => parseArticle(markdown, { sourceId: articlePath ?? "desktop-draft" }), [markdown, articlePath]);
  const dirty = savedMarkdown !== null ? markdown !== savedMarkdown : Boolean(articlePath);
  const title = parsed.document?.metadata.title ?? t("app.article.untitled");
  const missingSubtitleFrame = Boolean(parsed.document?.metadata.subtitle && template && !template.compiled.frameRoles["hero-subtitle"]);
  const templateReady = Boolean(template && !missingSubtitleFrame && !template.diagnostics.some((item) => item.severity === "error"));

  useEffect(() => {
    document.title = t("app.title");
  }, [t, locale]);

  // Rust owns the stored preference and the native menu checkmark; this only drives the WebView.
  const changeLocale = useCallback((next: Locale) => {
    void setStoredLocale(next).catch(() => undefined);
    void i18n.changeLanguage(next);
    applyDocumentLocale(next);
  }, [i18n]);

  const refreshHost = useCallback(async () => {
    setHost(null);
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
    // Diagnostic text stays English: it originates in the contract-owned core and template
    // packages and is persisted in host job results, so it is not part of the UI catalog.
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
      setNotice({ kind: "info", text: t("app.notice.opened", { file: fileName(opened.path) }) });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, [t]);

  const handleSaveMarkdown = useCallback(async (): Promise<string | null> => {
    try {
      const path = await saveMarkdown(articlePath, markdown);
      if (!path) return null;
      setArticlePath(path);
      setSavedMarkdown(markdown);
      setNotice({ kind: "success", text: t("app.notice.saved", { file: fileName(path) }) });
      return path;
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
      return null;
    }
  }, [articlePath, markdown, t]);

  const inspectTemplate = useCallback(async (path: string) => {
    setBusy(true);
    setProgress({ key: "app.progress.inspectTemplate" });
    setTemplatePath(path);
    setTemplate(null);
    setDiagnostics([]);
    try {
      const result = await invokeHost("inspectTemplate", { templatePath: path }, t);
      const scan = result.scan as TemplateScan | undefined;
      if (!scan) throw new Error(t("app.error.noTemplateScan"));
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
        setNotice({ kind: "error", text: t("app.notice.templateUnusable") });
        return;
      }
      setTemplate({ scan, inventory: inventoryResult.inventory, compiled: compilation.template, diagnostics: deduplicateDiagnostics(resultDiagnostics) });
      setDiagnostics(deduplicateDiagnostics(resultDiagnostics));
      if (resultDiagnostics.some((item) => item.severity === "error")) {
        setNotice({ kind: "error", text: t("app.notice.templateIssues") });
      } else {
        setNotice({ kind: "success", text: t("app.notice.templateReady", { name: inventoryResult.inventory.name }) });
      }
    } catch (error) {
      const message = errorMessage(error);
      setDiagnostics([{ code: "Template.InspectionFailed", message, severity: "error" }]);
      setNotice({ kind: "error", text: message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [t]);

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
      setNotice({ kind: "error", text: t("app.notice.fixMarkdown") });
      return;
    }
    if (!template || !templateReady || !templatePath) {
      setNotice({ kind: "error", text: t("app.notice.chooseTemplate") });
      return;
    }
    if (!host?.available) {
      setNotice({ kind: "error", text: host?.message ?? t("app.notice.hostUnavailable") });
      return;
    }

    setBusy(true);
    let stage: OutputStage | null = null;
    let finalOutputPath = outputPath;
    try {
      setProgress({ key: "app.progress.saveAndCheck" });
      const savedPath = await saveMarkdown(articlePath, markdown);
      if (!savedPath) throw new Error(t("app.error.noSavedArticle"));
      setArticlePath(savedPath);
      setSavedMarkdown(markdown);

      const localSources = parsed.document.blocks.filter((block) => block.type === "image").map((block) => block.src);
      const assetResult = await checkAssets(savedPath, localSources);
      const resolvedDocument = resolveArticleAssets(parsed.document, assetResult.resolved);
      const readyDiagnostics = deduplicateDiagnostics([...initialDiagnostics, ...assetResult.diagnostics]);
      setDiagnostics(readyDiagnostics);
      if (readyDiagnostics.some((item) => item.severity === "error")) {
        setNotice({ kind: "error", text: t("app.notice.fixImages") });
        return;
      }

      if (!finalOutputPath) {
        finalOutputPath = await chooseOutput();
        if (!finalOutputPath) return;
        setOutputPath(finalOutputPath);
      }
      stage = await prepareOutputStage(finalOutputPath);
      setProgress({ key: "app.progress.buildDocument" });

      let renderCount = 0;
      const adapter = createIndesignAdapter({
        inspectTemplate: async () => template.inventory,
        render: async (input) => {
          renderCount += 1;
          setProgress(renderCount === 1
            ? { key: "app.progress.compose" }
            : { key: "app.progress.reflow", params: { count: renderCount } });
          const hostPlan = planHostOperations(input.document, input.template, input.ir);
          if (!hostPlan.plan || hostPlan.diagnostics.some((item) => item.severity === "error")) {
            throw new Error(hostPlan.diagnostics.map((item) => item.message).join("\n") || t("app.error.noLayoutPlan"));
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
          }, t);
          if (!result.observation) throw new Error(t("app.error.noObservation"));
          return result.observation as {
            pageCount: number;
            overset: Array<{ storyId: string; pageId: string; frameRef: string; remainingCharacters?: number }>;
            missingAssets: string[];
            missingFonts: string[];
          };
        },
        dump: async (documentPath) => {
          setProgress({ key: "app.progress.checkStructure" });
          const result = await invokeHost("dump", { documentPath }, t);
          if (!result.documentDump) throw new Error(t("app.error.noDocumentDump"));
          return result.documentDump as DocumentDump;
        },
        export: async (documentPath, destination, format) => {
          const result = await invokeHost("export", { documentPath, outputPath: destination, format, pageNumber: 1 }, t);
          if (!result.outputPath) throw new Error(t("app.error.noExportPath"));
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
        setNotice({ kind: "error", text: t("app.notice.layoutIncomplete") });
        return;
      }

      setProgress({ key: "app.progress.verify" });
      const dump = await adapter.dump(stage.documentPath);
      const verification = verifyDocumentDump(dump, resolvedDocument);
      if (verification.some((item) => item.severity === "error")) {
        setDiagnostics(deduplicateDiagnostics([...readyDiagnostics, ...publishDiagnostics, ...verification]));
        setNotice({ kind: "error", text: t("app.notice.verificationFailed") });
        return;
      }
      const pageCount = dump.pages.length;
      if (!pageCount) throw new Error(t("app.error.noPages"));

      setProgress({ key: "app.progress.exportPdf" });
      await invokeHost("export", { documentPath: stage.documentPath, outputPath: stage.pdfPath, format: "pdf" }, t);
      for (let page = 1; page <= pageCount; page += 1) {
        setProgress({ key: "app.progress.previews", params: { page, total: pageCount } });
        const previewPath = joinPath(stage.previewDirectory, `page-${String(page).padStart(3, "0")}.png`);
        await invokeHost("export", { documentPath: stage.documentPath, outputPath: previewPath, format: "png", pageNumber: page }, t);
      }

      setProgress({ key: "app.progress.finalize" });
      const finalFiles = await finalizeOutputStage(finalOutputPath, stage.stageId, pageCount);
      stage = null;
      setOutput(finalFiles);
      setOutputPageCount(pageCount);
      setPreviewIndex(1);
      setPreview(await readPreview(joinPath(finalFiles.previewDirectory, "page-001.png")));
      setDiagnostics(deduplicateDiagnostics([...readyDiagnostics, ...publishDiagnostics, ...verification]));
      setNotice({ kind: "success", text: t("app.notice.published", { file: fileName(finalFiles.documentPath), count: pageCount }) });
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
      setProgress(null);
    }
  }, [articlePath, host, markdown, outputPath, parsed, template, templatePath, templateReady, t]);

  const showPreview = useCallback(async (index: number) => {
    if (!output || index < 1 || index > outputPageCount) return;
    setPreviewIndex(index);
    try {
      setPreview(await readPreview(joinPath(output.previewDirectory, `page-${String(index).padStart(3, "0")}.png`)));
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, [output, outputPageCount]);

  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
  const progressText = progress ? t(progress.key, progress.params ?? {}) : "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="brand-name">Folio</div>
            <div className="brand-caption">DESKTOP PUBLISHING</div>
          </div>
        </div>

        <div className="sidebar-section-label">{t("app.nav.workspace")}</div>
        <button className="side-link active" type="button"><span className="side-icon">▤</span> {t("app.nav.publish")}</button>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">{t("app.nav.currentArticle")}</div>
        <div className="article-card">
          <div className="article-card-icon">MD</div>
          <div className="article-card-copy">
            <div className="article-card-title">{title}</div>
            <div className="article-card-meta">{articlePath ? fileName(articlePath) : t("app.article.unsavedDraft")}</div>
          </div>
          {dirty && <span className="dirty-dot" title={t("app.article.unsavedChanges")} />}
        </div>
        <div className="sidebar-footer">
          <div className={`host-indicator ${host?.available ? "online" : "offline"}`}>
            <span className="status-dot" />
            <span>{host === null
              ? t("app.host.checking")
              : host.available
                ? t("app.host.connected", { version: host.version ?? t("app.host.ready") })
                : t("app.host.unavailable")}</span>
          </div>
          <button className="text-button sidebar-host-refresh" type="button" onClick={() => void refreshHost()}>{t("app.host.refresh")}</button>
          <div className="locale-switch" role="group" aria-label={t("app.locale.label")}>
            {supportedLocales.map((option) => (
              <button
                key={option}
                type="button"
                className={locale === option ? "active" : ""}
                aria-pressed={locale === option}
                onClick={() => changeLocale(option)}
              >
                {t(`app.locale.${option}`)}
              </button>
            ))}
          </div>
          <div className="sidebar-version">Folio · 0.1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>{t("app.nav.workspace")}</span><span className="crumb-separator">/</span><strong>{t("app.nav.publish")}</strong></div>
          <div className="topbar-actions">
            <button className="button quiet" type="button" onClick={() => void handleOpenMarkdown()} disabled={busy}>{t("app.action.openMarkdown")}</button>
            <button className="button quiet" type="button" onClick={() => void handleSaveMarkdown()} disabled={busy}>{t("app.action.saveDraft")}</button>
          </div>
        </header>

        <div className="content-scroll">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{t("app.heading.eyebrow")} <span className="eyebrow-line" /></div>
              <h1>{t("app.heading.title")}</h1>
              <p className="page-subtitle">{t("app.heading.subtitle")}</p>
            </div>
            <div className="heading-badge"><span className="badge-spark">✳</span> INDD · PDF · PNG</div>
          </div>

          {notice && <div className={`notice ${notice.kind}`} role="status"><span className="notice-icon">{notice.kind === "success" ? "✓" : notice.kind === "error" ? "!" : "i"}</span><span>{notice.text}</span><button type="button" aria-label={t("app.action.dismiss")} onClick={() => setNotice(null)}>×</button></div>}

          <div className="workflow-grid">
            <section className="editor-panel panel">
              <div className="panel-heading editor-heading">
                <div className="panel-title-group"><span className="step-number">01</span><div><h2>{t("app.editor.title")}</h2><p>{t("app.editor.hint")}</p></div></div>
                <div className={`file-state ${dirty ? "changed" : "saved"}`}><span className="file-state-dot" />{dirty ? t("app.editor.stateChanged") : articlePath ? t("app.editor.stateSaved") : t("app.editor.stateNew")}</div>
              </div>
              <div className="editor-toolbar"><span className="markdown-chip">M↓</span><span>{t("app.editor.format")}</span><span className="toolbar-divider" /><span className="editor-file-name">{articlePath ? fileName(articlePath) : "untitled-article.md"}</span><span className="editor-toolbar-spacer" /><span className="line-count">{t("app.editor.lineCount", { count: markdown.split("\n").length })}</span></div>
              <textarea
                className="markdown-editor"
                aria-label={t("app.editor.ariaLabel")}
                value={markdown}
                spellCheck={false}
                onChange={(event) => setMarkdown(event.target.value)}
                disabled={busy}
              />
              <div className="editor-footer"><span><span className="footer-dot" /> {t("app.editor.sourceLabel")}</span><span>{parsed.document ? t("app.editor.blockCount", { count: parsed.document.blocks.length }) : t("app.editor.blocked")}</span></div>
            </section>

            <div className="workflow-side">
              <section className="setup-card panel">
                <div className="panel-heading">
                  <div className="panel-title-group"><span className="step-number">02</span><div><h2>{t("app.template.title")}</h2><p>{t("app.template.hint")}</p></div></div>
                  <span className={`step-check ${templateReady ? "complete" : ""}`}>{templateReady ? "✓" : "2"}</span>
                </div>
                <button className={`selection-row ${template ? "selected" : ""}`} type="button" onClick={() => void handleChooseTemplate()} disabled={busy}>
                  <span className="file-icon indesign">Id</span>
                  <span className="selection-copy">
                    <strong>{template ? fileName(templatePath ?? "") : t("app.template.select")}</strong>
                    <small>{template
                      ? `${t("app.template.pageCount", { count: template.scan.document.pageCount })} · ${t("app.template.styleCount", { count: template.scan.styles.length })}`
                      : t("app.template.untouched")}</small>
                  </span>
                  <span className="selection-action">{template ? t("app.action.change") : t("app.action.browse")}</span>
                </button>
                {template && <div className={`template-result ${templateReady ? "ready" : "needs-attention"}`}><span className="result-icon">{templateReady ? "✓" : "!"}</span><span>{templateReady ? t("app.template.ready", { name: template.compiled.name }) : t("app.template.needsAttention")}</span></div>}
              </section>

              <section className="setup-card panel output-card">
                <div className="panel-heading">
                  <div className="panel-title-group"><span className="step-number">03</span><div><h2>{t("app.output.title")}</h2><p>{t("app.output.hint")}</p></div></div>
                  <span className={`step-check ${outputPath ? "complete" : ""}`}>{outputPath ? "✓" : "3"}</span>
                </div>
                <button className={`selection-row ${outputPath ? "selected" : ""}`} type="button" onClick={() => void handleChooseOutput()} disabled={busy}>
                  <span className="file-icon folder">↗</span>
                  <span className="selection-copy"><strong>{outputPath ? fileName(outputPath) : t("app.output.choose")}</strong><small>{outputPath ? parentPath(outputPath) : t("app.output.included")}</small></span>
                  <span className="selection-action">{outputPath ? t("app.action.change") : t("app.action.browse")}</span>
                </button>
              </section>

              <section className="publish-card">
                <div className="publish-card-top"><div className="publish-orb"><span>✳</span></div><div><strong>{t("app.publish.ready")}</strong><small>{t("app.publish.hint")}</small></div></div>
                <button className="publish-button" type="button" onClick={() => void handlePublish()} disabled={busy || !parsed.document || !templateReady || !host?.available}>
                  <span>{busy ? t("app.publish.working") : t("app.publish.action")}</span><span className="publish-arrow">{busy ? "···" : "↗"}</span>
                </button>
                {busy ? <div className="progress-line"><span className="progress-spinner" />{progressText || t("app.progress.working")}</div> : <div className="publish-hint">{t("app.publish.creates")}</div>}
              </section>
            </div>
          </div>

          <section className="results-grid">
            <div className="diagnostics-panel panel">
              <div className="results-heading"><div><span className="section-overline">{t("app.preflight.overline")}</span><h2>{t("app.preflight.title")}</h2></div><span className={`issue-count ${errorCount > 0 ? "has-errors" : ""}`}>{t("app.preflight.errorCount", { count: errorCount })} · {t("app.preflight.warningCount", { count: warningCount })}</span></div>
              {diagnostics.length ? <div className="diagnostic-list">{diagnostics.map((item, index) => <DiagnosticRow key={`${item.code}-${item.path ?? index}`} diagnostic={item} />)}</div> : <div className="empty-checks"><span className="checks-mark">✓</span><div><strong>{t("app.preflight.emptyTitle")}</strong><span>{t("app.preflight.emptyHint")}</span></div></div>}
            </div>

            <div className="preview-panel panel">
              <div className="results-heading preview-heading"><div><span className="section-overline">{t("app.preview.overline")}</span><h2>{output ? t("app.preview.titleReady") : t("app.preview.titleIdle")}</h2></div>{output && <button className="text-button" type="button" onClick={() => void openOutput(output.documentPath)}>{t("app.preview.openIndd")}</button>}</div>
              <div className={`preview-stage ${preview ? "has-preview" : ""}`}>
                {preview ? <img src={preview} alt={t("app.preview.alt", { page: previewIndex })} /> : <div className="preview-placeholder"><div className="paper-preview"><span /><span /><span /><i /></div><div className="preview-placeholder-copy"><strong>{t("app.preview.emptyTitle")}</strong><span>{t("app.preview.emptyHint")}</span></div></div>}
              </div>
              {output ? <div className="preview-controls"><button type="button" aria-label={t("app.preview.previous")} onClick={() => void showPreview(Math.max(1, previewIndex - 1))} disabled={previewIndex <= 1}>‹</button><span>{t("app.preview.position", { current: previewIndex, total: outputPageCount })}</span><button type="button" aria-label={t("app.preview.next")} onClick={() => void showPreview(Math.min(outputPageCount, previewIndex + 1))} disabled={previewIndex >= outputPageCount}>›</button><span className="preview-control-spacer" /><button className="open-pdf-button" type="button" onClick={() => void openOutput(output.pdfPath)}>{t("app.preview.openPdf")}</button></div> : <div className="preview-meta"><span>{t("app.preview.metaComposition")}</span><span>·</span><span>{t("app.preview.metaLive")}</span></div>}
            </div>
          </section>

          <footer className="content-footer"><span>{t("app.footer.note")}</span><span>{t("app.footer.local")} <i /></span></footer>
        </div>
      </main>
    </div>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  return <div className={`diagnostic-row ${diagnostic.severity}`}><span className="diagnostic-marker">{diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}</span><div><strong>{diagnostic.message}</strong>{diagnostic.path && <small>{diagnostic.path}</small>}</div><span className="diagnostic-code">{diagnostic.code}</span></div>;
}

type Translate = TFunction;

async function invokeHost(action: HostJob["action"], payload: Record<string, unknown>, t: Translate): Promise<Record<string, unknown>> {
  const job: HostJob = { schemaVersion: 1, jobId: crypto.randomUUID(), action, payload };
  const result: HostJobResult = await runHostJob(job);
  if (result.status !== "succeeded") {
    const messages = result.diagnostics.map((item) => item.message).filter(Boolean);
    throw new Error(messages.join("\n") || t("app.error.publishFailed", { action }));
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
