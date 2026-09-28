import { useTranslation } from "react-i18next";
import { MarkdownArticlePreview } from "../MarkdownArticlePreview.js";
import { fileName } from "../paths.js";

export type EditorViewMode = "preview" | "source";

type EditorPanelProps = {
  markdown: string;
  busy: boolean;
  mode: EditorViewMode;
  onModeChange: (mode: EditorViewMode) => void;
  onMarkdownChange: (markdown: string) => void;
  articlePath: string | null;
  dirty: boolean;
  title: string;
  subtitle?: string | undefined;
  lineCount: number;
  // `null` while the article cannot be parsed; the count replaces the blocked hint.
  blockCount: number | null;
};

export function EditorPanel({ markdown, busy, mode, onModeChange, onMarkdownChange, articlePath, dirty, title, subtitle, lineCount, blockCount }: EditorPanelProps) {
  const { t } = useTranslation();
  return (
    <section className="editor-panel panel">
      <div className="panel-heading editor-heading">
        <div className="panel-title-group"><span className="step-number">01</span><div><h2>{t("app.editor.title")}</h2><p>{t("app.editor.hint")}</p></div></div>
        <div className={`file-state ${dirty ? "changed" : "saved"}`}><span className="file-state-dot" />{dirty ? t("app.editor.stateChanged") : articlePath ? t("app.editor.stateSaved") : t("app.editor.stateNew")}</div>
      </div>
      <div className="editor-toolbar">
        <span className="markdown-chip">M↓</span><span>{t("app.editor.format")}</span><span className="toolbar-divider" />
        <span className="editor-file-name">{articlePath ? fileName(articlePath) : "untitled-article.md"}</span>
        <span className="editor-toolbar-spacer" />
        <span className="line-count">{t("app.editor.lineCount", { count: lineCount })}</span>
        <div className="editor-mode-switch" role="group" aria-label={t("app.editor.modeLabel")}>
          <button type="button" aria-pressed={mode === "preview"} className={mode === "preview" ? "active" : ""} onClick={() => onModeChange("preview")} disabled={busy}>{t("app.editor.previewMode")}</button>
          <button type="button" aria-pressed={mode === "source"} className={mode === "source" ? "active" : ""} onClick={() => onModeChange("source")} disabled={busy}>{t("app.editor.sourceMode")}</button>
        </div>
      </div>
      {mode === "source"
        ? <textarea
            className="markdown-editor"
            aria-label={t("app.editor.ariaLabel")}
            value={markdown}
            spellCheck={false}
            onChange={(event) => onMarkdownChange(event.target.value)}
            disabled={busy}
          />
        : <MarkdownArticlePreview
            markdown={markdown}
            articlePath={articlePath}
            title={title}
            subtitle={subtitle}
          />}
      <div className="editor-footer">
        <span><span className="footer-dot" /> {mode === "source" ? t("app.editor.sourceLabel") : t("app.editor.renderedLabel")}</span>
        <span>{blockCount !== null ? t("app.editor.blockCount", { count: blockCount }) : t("app.editor.blocked")}</span>
      </div>
    </section>
  );
}
