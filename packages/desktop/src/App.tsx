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
import { compileTemplate, createTemplateInventory, resolveTemplateRoles } from "@folio/template";
import type { RoleResolution } from "@folio/template";
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
import { MarkdownArticlePreview } from "./MarkdownArticlePreview.js";

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
  resolutions: RoleResolution[];
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
  const [editorMode, setEditorMode] = useState<"preview" | "source">("preview");

  const locale = (i18n.resolvedLanguage ?? i18n.language) as Locale;

  const parsed = useMemo(() => parseArticle(markdown, {
    sourceId: articlePath ?? "desktop-draft",
    fallbackTitle: t("app.article.untitled")
  }), [markdown, articlePath, t]);
  const dirty = savedMarkdown !== null ? markdown !== savedMarkdown : Boolean(articlePath);
  const title = parsed.document?.metadata.title ?? t("app.article.untitled");
  const templateReady = Boolean(template);

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
    setDiagnostics(deduplicateDiagnostics([...parsed.diagnostics, ...(template?.diagnostics ?? [])]));
  }, [parsed, template]);

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
      const assignments = resolveTemplateRoles(scan, { templateId: templateId(path), name });
      const inventoryResult = assignments.assignments
        ? createTemplateInventory(scan, assignments.assignments)
        : { diagnostics: assignments.diagnostics, inventory: undefined };
      const compilation = inventoryResult.inventory ? compileTemplate(inventoryResult.inventory) : { diagnostics: [] as Diagnostic[], template: undefined };
      const resultDiagnostics = [...assignments.diagnostics, ...inventoryResult.diagnostics, ...compilation.diagnostics];
      if (!inventoryResult.inventory || !compilation.template) {
        setDiagnostics(deduplicateDiagnostics(resultDiagnostics));
        setNotice({ kind: "error", text: t("app.notice.templateUnusable") });
        return;
      }
      setTemplate({ scan, inventory: inventoryResult.inventory, compiled: compilation.template, diagnostics: deduplicateDiagnostics(resultDiagnostics), resolutions: assignments.resolutions });
      setDiagnostics(deduplicateDiagnostics(resultDiagnostics));
      setNotice({ kind: "success", text: t("app.notice.templateReady", { name: inventoryResult.inventory.name }) });
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
    if (!parsed.document) {
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
      let assetResult: Awaited<ReturnType<typeof checkAssets>> = { resolved: {}, diagnostics: [] };
      try {
        assetResult = await checkAssets(savedPath, localSources);
      } catch (error) {
        assetResult.diagnostics.push({ code: "Asset.ScanFailed", message: errorMessage(error), severity: "warning" });
      }
      const resolvedDocument = resolveArticleAssets(parsed.document, assetResult.resolved);
      const readyDiagnostics = deduplicateDiagnostics([...initialDiagnostics, ...assetResult.diagnostics]);
      setDiagnostics(readyDiagnostics);

      if (!finalOutputPath) {
        finalOutputPath = await chooseOutput();
        if (!finalOutputPath) return;
        setOutputPath(finalOutputPath);
      }
      stage = await prepareOutputStage(finalOutputPath);
      setProgress({ key: "app.progress.buildDocument" });

      let renderCount = 0;
      const hostPlanDiagnostics: Diagnostic[] = [];
      const adapter = createIndesignAdapter({
        inspectTemplate: async () => template.inventory,
        render: async (input) => {
          renderCount += 1;
          setProgress(renderCount === 1
            ? { key: "app.progress.compose" }
            : { key: "app.progress.reflow", params: { count: renderCount } });
          const hostPlan = planHostOperations(input.document, input.template, input.ir);
          hostPlanDiagnostics.push(...hostPlan.diagnostics.map((item) => ({ ...item, severity: "warning" as const })));
          if (!hostPlan.plan) {
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
      const publishDiagnostics = published.diagnostics.map((item) => item.severity === "error" ? { ...item, severity: "warning" as const } : item);
      if (!published.ir) throw new Error(t("app.notice.layoutIncomplete"));

      setProgress({ key: "app.progress.verify" });
      let pageCount = published.observation?.pageCount || published.ir.pages.length;
      let verification: Diagnostic[] = [];
      try {
        const dump = await adapter.dump(stage.documentPath);
        verification = verifyDocumentDump(dump, resolvedDocument).map((item) => item.severity === "error" ? { ...item, severity: "warning" as const } : item);
        if (dump.pages.length) pageCount = dump.pages.length;
      } catch (error) {
        verification.push({ code: "DocumentDump.Unavailable", message: errorMessage(error), severity: "warning" });
      }
      if (!pageCount) {
        pageCount = published.ir.pages.length;
        verification.push({ code: "Document.PagesUnverified", message: "InDesign did not return a reliable page count; the planned page count is shown.", severity: "warning" });
      }

      const outputDiagnostics: Diagnostic[] = [];
      let pdfCreated = false;
      setProgress({ key: "app.progress.exportPdf" });
      try {
        await invokeHost("export", { documentPath: stage.documentPath, outputPath: stage.pdfPath, format: "pdf" }, t);
        pdfCreated = true;
      } catch (error) {
        outputDiagnostics.push({ code: "Publish.PdfExportFailed", message: errorMessage(error), severity: "warning" });
      }
      const attemptedPreviews: number[] = [];
      for (let page = 1; page <= pageCount; page += 1) {
        setProgress({ key: "app.progress.previews", params: { page, total: pageCount } });
        const previewPath = joinPath(stage.previewDirectory, `page-${String(page).padStart(3, "0")}.png`);
        try {
          await invokeHost("export", { documentPath: stage.documentPath, outputPath: previewPath, format: "png", pageNumber: page }, t);
          attemptedPreviews.push(page);
        } catch (error) {
          outputDiagnostics.push({ code: "Publish.PreviewExportFailed", message: errorMessage(error), severity: "warning", path: `pages.${page}` });
        }
      }

      setProgress({ key: "app.progress.finalize" });
      const finalDiagnostics = deduplicateDiagnostics([...readyDiagnostics, ...hostPlanDiagnostics, ...publishDiagnostics, ...verification, ...outputDiagnostics]);
      const report = buildChineseReport(i18n.getFixedT("zh-Hans"), title, template.resolutions, finalDiagnostics, { pdfCreated, previewPages: attemptedPreviews });
      const finalFiles = await finalizeOutputStage(finalOutputPath, stage.stageId, report, pageCount);
      stage = null;
      setOutput(finalFiles);
      const allDiagnostics = deduplicateDiagnostics([...finalDiagnostics, ...(finalFiles.previewPages.length < pageCount ? [{
        code: "Publish.PreviewPartial",
        message: "Some page previews could not be generated or were empty.",
        severity: "warning" as const
      }] : []), ...finalFiles.finalizationWarnings.map((message) => ({ code: "Publish.OptionalOutputMissing", message, severity: "warning" as const }))]);
      setDiagnostics(allDiagnostics);
      const firstPreview = finalFiles.previewPages[0];
      setPreviewIndex(firstPreview ?? 1);
      if (firstPreview && finalFiles.previewDirectory) {
        try { setPreview(await readPreview(joinPath(finalFiles.previewDirectory, `page-${String(firstPreview).padStart(3, "0")}.png`))); }
        catch (error) { setPreview(null); }
      }
      setNotice({
        kind: allDiagnostics.some((item) => item.severity === "warning") ? "info" : "success",
        text: allDiagnostics.some((item) => item.severity === "warning")
          ? t("app.notice.publishedDegraded", { file: fileName(finalFiles.documentPath) })
          : t("app.notice.published", { file: fileName(finalFiles.documentPath), count: pageCount })
      });
    } catch (error) {
      const failure = errorMessage(error);
      if (stage && finalOutputPath) {
        try {
          const salvageReport = buildChineseReport(i18n.getFixedT("zh-Hans"), title, template.resolutions, [
            ...initialDiagnostics,
            { code: "Publish.RecoveredAfterIssue", message: failure, severity: "warning" }
          ], { pdfCreated: false, previewPages: [] });
          const recovered = await finalizeOutputStage(finalOutputPath, stage.stageId, salvageReport, 0);
          stage = null;
          setOutput(recovered);
          setPreview(null);
          setDiagnostics(deduplicateDiagnostics([...initialDiagnostics, { code: "Publish.RecoveredAfterIssue", message: failure, severity: "warning" }]));
          setNotice({ kind: "info", text: t("app.notice.publishedDegraded", { file: fileName(recovered.documentPath) }) });
        } catch (salvageError) {
          setNotice({ kind: "error", text: failure });
          setDiagnostics((current) => deduplicateDiagnostics([...current, { code: "Publish.Failed", message: errorMessage(salvageError), severity: "error" }]));
        }
      } else {
        setNotice({ kind: "error", text: failure });
        setDiagnostics((current) => deduplicateDiagnostics([...current, { code: "Publish.Failed", message: failure, severity: "error" }]));
      }
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
  }, [articlePath, host, i18n, markdown, outputPath, parsed, template, templatePath, templateReady, t]);

  const showPreview = useCallback(async (pageNumber: number) => {
    if (!output?.previewDirectory || !output.previewPages.includes(pageNumber)) return;
    setPreviewIndex(pageNumber);
    try {
      setPreview(await readPreview(joinPath(output.previewDirectory, `page-${String(pageNumber).padStart(3, "0")}.png`)));
    } catch (error) {
      setPreview(null);
      setNotice({ kind: "info", text: t("app.notice.previewUnavailable") });
    }
  }, [output, t]);

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
              <div className="editor-toolbar">
                <span className="markdown-chip">M↓</span><span>{t("app.editor.format")}</span><span className="toolbar-divider" />
                <span className="editor-file-name">{articlePath ? fileName(articlePath) : "untitled-article.md"}</span>
                <span className="editor-toolbar-spacer" />
                <span className="line-count">{t("app.editor.lineCount", { count: markdown.split("\n").length })}</span>
                <div className="editor-mode-switch" role="group" aria-label={t("app.editor.modeLabel")}>
                  <button type="button" aria-pressed={editorMode === "preview"} className={editorMode === "preview" ? "active" : ""} onClick={() => setEditorMode("preview")} disabled={busy}>{t("app.editor.previewMode")}</button>
                  <button type="button" aria-pressed={editorMode === "source"} className={editorMode === "source" ? "active" : ""} onClick={() => setEditorMode("source")} disabled={busy}>{t("app.editor.sourceMode")}</button>
                </div>
              </div>
              {editorMode === "source"
                ? <textarea
                    className="markdown-editor"
                    aria-label={t("app.editor.ariaLabel")}
                    value={markdown}
                    spellCheck={false}
                    onChange={(event) => setMarkdown(event.target.value)}
                    disabled={busy}
                  />
                : <MarkdownArticlePreview
                    markdown={markdown}
                    articlePath={articlePath}
                    title={title}
                    subtitle={parsed.document?.metadata.subtitle}
                  />}
              <div className="editor-footer"><span><span className="footer-dot" /> {editorMode === "source" ? t("app.editor.sourceLabel") : t("app.editor.renderedLabel")}</span><span>{parsed.document ? t("app.editor.blockCount", { count: parsed.document.blocks.length }) : t("app.editor.blocked")}</span></div>
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
              {template && <>
                <div className={`template-result ${templateReady ? "ready" : "needs-attention"}`}><span className="result-icon">{templateReady ? "✓" : "!"}</span><span>{t("app.template.ready", { name: template.compiled.name, count: template.diagnostics.filter((item) => item.severity === "warning").length })}</span></div>
                <details className="template-role-details">
                  <summary>{t("app.template.roleSummary", { count: template.resolutions.filter((item) => item.selected).length })}</summary>
                  <ul>{template.resolutions.filter((item) => item.selected).map((item) => <li key={item.role}><span>{t(`app.template.roles.${item.role}`, { defaultValue: item.role })}</span><strong>{item.selected?.name}</strong><small>{t(`app.template.confidence.${item.confidence}`)} · {item.selected?.score}</small></li>)}</ul>
                </details>
              </>}
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
              {diagnostics.length ? <div className="diagnostic-list">{diagnostics.map((item, index) => <DiagnosticRow key={`${item.code}-${item.path ?? index}`} diagnostic={item} message={translateDiagnostic(t, item)} />)}</div> : <div className="empty-checks"><span className="checks-mark">✓</span><div><strong>{t("app.preflight.emptyTitle")}</strong><span>{t("app.preflight.emptyHint")}</span></div></div>}
            </div>

            <div className="preview-panel panel">
              <div className="results-heading preview-heading"><div><span className="section-overline">{t("app.preview.overline")}</span><h2>{output ? t("app.preview.titleReady") : t("app.preview.titleIdle")}</h2></div>{output && <button className="text-button" type="button" onClick={() => void openOutput(output.documentPath)}>{t("app.preview.openIndd")}</button>}</div>
              <div className={`preview-stage ${preview ? "has-preview" : ""}`}>
                {preview ? <img src={preview} alt={t("app.preview.alt", { page: previewIndex })} /> : <div className="preview-placeholder"><div className="paper-preview"><span /><span /><span /><i /></div><div className="preview-placeholder-copy"><strong>{output ? t("app.preview.unavailableTitle") : t("app.preview.emptyTitle")}</strong><span>{output ? t("app.preview.unavailableHint") : t("app.preview.emptyHint")}</span></div></div>}
              </div>
              {output ? <div className="preview-controls">
                {output.previewPages.length > 0 ? <>
                  <button type="button" aria-label={t("app.preview.previous")} onClick={() => { const slot = output.previewPages.indexOf(previewIndex); if (slot > 0) void showPreview(output.previewPages[slot - 1]!); }} disabled={output.previewPages.indexOf(previewIndex) <= 0}>‹</button>
                  <span>{t("app.preview.position", { current: Math.max(1, output.previewPages.indexOf(previewIndex) + 1), total: output.previewPages.length, page: previewIndex })}</span>
                  <button type="button" aria-label={t("app.preview.next")} onClick={() => { const slot = output.previewPages.indexOf(previewIndex); if (slot >= 0 && slot < output.previewPages.length - 1) void showPreview(output.previewPages[slot + 1]!); }} disabled={output.previewPages.indexOf(previewIndex) < 0 || output.previewPages.indexOf(previewIndex) >= output.previewPages.length - 1}>›</button>
                </> : <span>{t("app.preview.noPreviews")}</span>}
                <span className="preview-control-spacer" />
                {output.pdfPath && <button className="open-pdf-button" type="button" onClick={() => void openOutput(output.pdfPath!)}>{t("app.preview.openPdf")}</button>}
                <button className="open-pdf-button" type="button" onClick={() => void openOutput(output.reportPath)}>{t("app.preview.openReport")}</button>
              </div> : <div className="preview-meta"><span>{t("app.preview.metaComposition")}</span><span>·</span><span>{t("app.preview.metaLive")}</span></div>}
            </div>
          </section>

          <footer className="content-footer"><span>{t("app.footer.note")}</span><span>{t("app.footer.local")} <i /></span></footer>
        </div>
      </main>
    </div>
  );
}

function DiagnosticRow({ diagnostic, message }: { diagnostic: Diagnostic; message: string }) {
  return <div className={`diagnostic-row ${diagnostic.severity}`}><span className="diagnostic-marker">{diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}</span><div><strong>{message}</strong>{diagnostic.path && <small>{diagnostic.path}</small>}</div><span className="diagnostic-code">{diagnostic.code}</span></div>;
}

type Translate = TFunction;

const diagnosticTranslationKeys: Record<string, string> = {
  "Template.RoleMatched": "roleMatched",
  "Template.RoleFallback": "roleFallback",
  "Template.RoleAmbiguous": "roleAmbiguous",
  "Template.PageRoleFallback": "pageFallback",
  "Template.PageRoleAmbiguous": "pageAmbiguous",
  "Template.ArticleFlowMissing": "articleFlowMissing",
  "Template.StyleFallback": "styleFallback",
  "Template.StyleMissing": "styleMissing",
  "Template.StyleMissingForContent": "styleMissingForContent",
  "Template.StyleKindMismatch": "styleKindMismatch",
  "Template.StyleRoleConflict": "styleRoleConflict",
  "Template.FrameKindMismatch": "frameKindMismatch",
  "Template.FallbackFrameCreated": "fallbackFrameCreated",
  "Template.CoverImageFrameMissing": "coverImageFrameMissing",
  "Template.StyleApplyFailed": "styleApplyFailed",
  "Template.AnnotationTargetMissing": "annotationTargetMissing",
  "Template.IdentityMissing": "templateIdentityMissing",
  "Template.InspectionFailed": "templateInspectionFailed",
  "Template.PageOrderChanged": "pageOrderChanged",
  "Article.InvalidFrontmatter": "invalidFrontmatter",
  "Article.TitleMismatch": "titleMismatch",
  "Article.TitleMissing": "titleMissing",
  "Article.ParseFailed": "parseFailed",
  "Article.BlockSkipped": "blockSkipped",
  "Article.QuoteShapeUnsupported": "quoteShapeUnsupported",
  "Article.UnknownMetadata": "unknownMetadata",
  "Article.ListFlattened": "listFlattened",
  "Article.TableFlattened": "tableFlattened",
  "Article.CodeBlockFlattened": "codeBlockFlattened",
  "Article.BlockFlattened": "blockFlattened",
  "Article.InlineImageFlattened": "inlineImageFlattened",
  "Asset.Missing": "assetMissing",
  "Asset.UnsupportedScheme": "assetUnsupported",
  "Asset.ScanFailed": "assetScanFailed",
  "Asset.PlaceholderFailed": "placeholderFailed",
  "Font.Missing": "fontMissing",
  "Story.UnexpectedOverset": "overset",
  "Story.PageLimitReached": "pageLimit",
  "Document.TextChanged": "textChanged",
  "Document.CoverTitleMissing": "titleChanged",
  "Document.CoverSubtitleChanged": "subtitleChanged",
  "Document.MainStoryMissing": "mainStoryMissing",
  "Document.PagesUnverified": "pagesUnverified",
  "DocumentDump.SchemaInvalid": "dumpInvalid",
  "DocumentDump.Unavailable": "dumpUnavailable",
  "HostJob.ExecutionFailed": "hostJobFailed",
  "Output.StageCleanupFailed": "stageCleanupFailed",
  "Publish.Failed": "publishFailed",
  "Publish.PdfExportFailed": "pdfFailed",
  "Publish.HostOperationFailed": "hostOperationFailed",
  "Publish.PreviewExportFailed": "previewFailed",
  "Publish.PreviewPartial": "previewPartial",
  "Publish.OptionalOutputMissing": "optionalOutputMissing",
  "Publish.RecoveredAfterIssue": "recoveredAfterIssue"
};

function translateDiagnostic(t: Translate, diagnostic: Diagnostic): string {
  const key = diagnosticTranslationKeys[diagnostic.code];
  if (!key) return diagnostic.message;
  const role = diagnostic.context?.role ?? diagnostic.path?.split(".").pop() ?? "";
  const details = diagnostic.context?.details ?? diagnostic.message;
  const translated = t(`app.diagnostics.${key}`, { ...(diagnostic.context ?? {}), role, details, defaultValue: "" });
  return translated || diagnostic.message;
}

function buildChineseReport(
  t: Translate,
  articleTitle: string,
  resolutions: RoleResolution[],
  diagnostics: Diagnostic[],
  exports: { pdfCreated: boolean; previewPages: number[] }
): string {
  const lines = [
    "Folio 发布检查报告",
    `文章：${articleTitle}`,
    `生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "模板角色自动识别："
  ];
  for (const resolution of resolutions) {
    const selected = resolution.selected;
    if (!selected) {
      lines.push(`- ${resolution.role}：没有找到候选对象，将按默认布局继续。`);
      continue;
    }
    lines.push(`- ${resolution.role}：${selected.name}；匹配分数 ${selected.score}；${t(`app.template.confidence.${resolution.confidence}`)}（${selected.matchedBy}）。`);
    if (resolution.candidates.length > 1) {
      lines.push(`  其他候选：${resolution.candidates.slice(0, 3).map((candidate) => `${candidate.name}（${candidate.score}）`).join("、")}`);
    }
  }
  lines.push("", "检查项目：");
  if (!diagnostics.length) lines.push("- 未发现需要检查的问题。");
  for (const item of diagnostics) {
    const detail = translateDiagnostic(t, item);
    const path = item.path ? `；位置：${item.path}` : "";
    lines.push(`- [${item.severity}] ${detail === item.message ? `需要检查：${item.code}${path}；详细信息：${item.message}` : detail + path}`);
  }
  lines.push(
    "",
    "导出尝试：",
    `- PDF：${exports.pdfCreated ? "已完成导出请求" : "未生成或导出失败"}`,
    `- 页面预览：${exports.previewPages.length ? `已完成第 ${exports.previewPages.join("、")} 页的导出请求` : "未生成"}`,
    "- INDD 与实际成果文件以报告末尾的最终文件清单为准。",
    "",
    "请在 InDesign 中打开 INDD，按以上提示检查排版、字体和图片。模板原文件未被修改。"
  );
  return lines.join("\n");
}

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
