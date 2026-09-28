import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Diagnostic,
  DocumentDump,
  SemanticDocument,
  TemplateScan
} from "@folio/contracts";
import { createIndesignAdapter, planHostOperations } from "@folio/indesign";
import { parseArticle, publishDocument } from "@folio/core";
import { compileTemplate, createTemplateInventory, resolveTemplateRoles } from "@folio/template";
import { applyDocumentLocale, type Locale } from "./i18n/index.js";
import { verifyDocumentDump } from "./publication-verification.js";
import {
  checkAssets,
  checkHost,
  chooseOutput,
  chooseTemplate,
  discardOutputStage,
  finalizeOutputStage,
  openAuxWindow,
  openMarkdown,
  prepareOutputStage,
  rememberReport,
  saveMarkdown,
  setStoredLocale
} from "./bridge.js";
import type { HostAvailability, OutputStage } from "./bridge.js";
import { countDiagnostics, deduplicateDiagnostics } from "./diagnostics.js";
import { buildChineseReport } from "./report-text.js";
import { invokeHost } from "./host-job.js";
import { fileName, fileStem, joinPath, templateId } from "./paths.js";
import { Sidebar } from "./components/Sidebar.js";
import { EditorPanel, type EditorViewMode } from "./components/EditorPanel.js";
import { SetupColumn, type TemplateState } from "./components/SetupColumn.js";
import { StatusBar } from "./components/StatusBar.js";

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
  const [editorMode, setEditorMode] = useState<EditorViewMode>("preview");

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

  // The report window reads the live list from shared state. The push is debounced because
  // diagnostics change on every keystroke while the article is being edited.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void rememberReport(diagnostics).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [diagnostics]);

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
      if (path) setOutputPath(path);
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }, []);

  const handlePublish = useCallback(async () => {
    const initialDiagnostics = parsed.diagnostics;
    setDiagnostics(initialDiagnostics);
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
      const allDiagnostics = deduplicateDiagnostics([...finalDiagnostics, ...(finalFiles.previewPages.length < pageCount ? [{
        code: "Publish.PreviewPartial",
        message: "Some page previews could not be generated or were empty.",
        severity: "warning" as const
      }] : []), ...finalFiles.finalizationWarnings.map((message) => ({ code: "Publish.OptionalOutputMissing", message, severity: "warning" as const }))]);
      setDiagnostics(allDiagnostics);
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

  const openPreviewWindow = useCallback(() => {
    void openAuxWindow("preview").catch((error) => setNotice({ kind: "error", text: errorMessage(error) }));
  }, []);

  const openReportWindow = useCallback(() => {
    void openAuxWindow("report").catch((error) => setNotice({ kind: "error", text: errorMessage(error) }));
  }, []);

  const { errors: errorCount, warnings: warningCount } = useMemo(
    () => countDiagnostics(diagnostics),
    [diagnostics]
  );
  const progressText = progress ? t(progress.key, progress.params ?? {}) : "";

  return (
    <div className="app-shell">
      <Sidebar
        title={title}
        articlePath={articlePath}
        dirty={dirty}
        locale={locale}
        onChangeLocale={changeLocale}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>{t("app.nav.workspace")}</span><span className="crumb-separator">/</span><strong>{t("app.nav.publish")}</strong></div>
          <div className="topbar-actions">
            <button className="button quiet" type="button" onClick={() => void handleOpenMarkdown()} disabled={busy}>{t("app.action.openMarkdown")}</button>
            <button className="button quiet" type="button" onClick={() => void handleSaveMarkdown()} disabled={busy}>{t("app.action.saveDraft")}</button>
          </div>
        </header>

        {notice && (
          <div className={`notice ${notice.kind}`} role="status">
            <span className="notice-icon">{notice.kind === "success" ? "✓" : notice.kind === "error" ? "!" : "i"}</span>
            <span>{notice.text}</span>
            <button type="button" aria-label={t("app.action.dismiss")} onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        <div className="workspace">
          <EditorPanel
            markdown={markdown}
            busy={busy}
            mode={editorMode}
            onModeChange={setEditorMode}
            onMarkdownChange={setMarkdown}
            articlePath={articlePath}
            dirty={dirty}
            title={title}
            subtitle={parsed.document?.metadata.subtitle}
            lineCount={markdown.split("\n").length}
            blockCount={parsed.document ? parsed.document.blocks.length : null}
          />

          <SetupColumn
            template={template}
            templatePath={templatePath}
            outputPath={outputPath}
            busy={busy}
            progressText={progressText}
            canPublish={Boolean(parsed.document)}
            hostReady={Boolean(host?.available)}
            onChooseTemplate={() => void handleChooseTemplate()}
            onChooseOutput={() => void handleChooseOutput()}
            onPublish={() => void handlePublish()}
          />
        </div>

        <StatusBar
          host={host}
          busy={busy}
          progressText={progressText}
          errorCount={errorCount}
          warningCount={warningCount}
          onRefreshHost={() => void refreshHost()}
          onOpenPreview={openPreviewWindow}
          onOpenReport={openReportWindow}
        />
      </main>
    </div>
  );
}

function resolveArticleAssets(document: SemanticDocument, resolved: Record<string, string>): SemanticDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) => block.type === "image" && resolved[block.src]
      ? { ...block, src: resolved[block.src]! }
      : block)
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
