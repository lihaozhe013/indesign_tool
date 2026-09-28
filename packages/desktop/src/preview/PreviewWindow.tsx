import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OutputPaths } from "../bridge.js";
import { getLastOutput, onOutputUpdated, openOutput, readPreview } from "../bridge.js";
import { joinPath } from "../paths.js";

type StageStatus = "idle" | "loading" | "ready" | "unavailable";

function previewFile(directory: string, page: number): string {
  return joinPath(directory, `page-${String(page).padStart(3, "0")}.png`);
}

export function PreviewWindow() {
  const { t } = useTranslation();
  const [output, setOutput] = useState<OutputPaths | null>(null);
  const [slot, setSlot] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<StageStatus>("idle");

  useEffect(() => {
    document.title = t("app.previewWindow.title");
  }, [t]);

  // Pull the stored result on startup, then follow broadcasts while the window stays open.
  useEffect(() => {
    let active = true;
    void getLastOutput()
      .then((value) => { if (active) setOutput(value); })
      .catch(() => undefined);
    const unlisten = onOutputUpdated((value) => setOutput(value));
    return () => {
      active = false;
      void unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    setSlot(0);
  }, [output]);

  useEffect(() => {
    let active = true;
    const page = output?.previewPages[slot];
    if (!output?.previewDirectory || page === undefined) {
      setImage(null);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    readPreview(previewFile(output.previewDirectory, page))
      .then((data) => {
        if (!active) return;
        setImage(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setImage(null);
        setStatus("unavailable");
      });
    return () => { active = false; };
  }, [output, slot]);

  const pages = output?.previewPages ?? [];
  const currentPage = pages[slot];

  const step = useCallback((delta: number) => {
    setSlot((current) => Math.min(Math.max(current + delta, 0), Math.max(pages.length - 1, 0)));
  }, [pages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <div className="aux-shell">
      <header className="aux-header">
        <div className="aux-heading-copy">
          <h1>{t("app.preview.titleReady")}</h1>
          <p>{t("app.previewWindow.hint")}</p>
        </div>
        {output && (
          <div className="aux-header-actions">
            <button className="button" type="button" onClick={() => void openOutput(output.documentPath)}>{t("app.preview.openIndd")}</button>
            {output.pdfPath && <button className="button" type="button" onClick={() => void openOutput(output.pdfPath!)}>{t("app.preview.openPdf")}</button>}
          </div>
        )}
      </header>

      <div className={`aux-stage ${status === "ready" ? "has-preview" : ""}`}>
        {status === "ready" && image && <img src={image} alt={t("app.preview.alt", { page: currentPage ?? slot + 1 })} />}
        {status === "loading" && <span className="aux-stage-note">{t("app.previewWindow.loading")}</span>}
        {status === "unavailable" && (
          <div className="preview-placeholder">
            <div className="paper-preview"><span /><span /><span /><i /></div>
            <div className="preview-placeholder-copy">
              <strong>{t("app.preview.unavailableTitle")}</strong>
              <span>{t("app.preview.unavailableHint")}</span>
            </div>
          </div>
        )}
        {status === "idle" && !output && (
          <div className="preview-placeholder">
            <div className="paper-preview"><span /><span /><span /><i /></div>
            <div className="preview-placeholder-copy">
              <strong>{t("app.preview.emptyTitle")}</strong>
              <span>{t("app.preview.emptyHint")}</span>
            </div>
          </div>
        )}
      </div>

      {output && (
        <footer className="aux-footer">
          {pages.length > 0 ? (
            <>
              <button type="button" className="page-step" aria-label={t("app.preview.previous")} onClick={() => step(-1)} disabled={slot <= 0}>‹</button>
              <span className="page-position">{t("app.preview.position", { current: slot + 1, total: pages.length, page: currentPage ?? 1 })}</span>
              <button type="button" className="page-step" aria-label={t("app.preview.next")} onClick={() => step(1)} disabled={slot >= pages.length - 1}>›</button>
              <span className="aux-footer-spacer" />
              <span className="aux-footer-note">{t("app.previewWindow.autoRefresh")}</span>
              <button className="button quiet" type="button" onClick={() => void openOutput(output.reportPath)}>{t("app.preview.openReport")}</button>
            </>
          ) : (
            <span className="aux-footer-note">{t("app.preview.noPreviews")}</span>
          )}
        </footer>
      )}
    </div>
  );
}
