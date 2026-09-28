import { useTranslation } from "react-i18next";
import type { CompiledTemplate, Diagnostic, TemplateInventory, TemplateScan } from "@folio/contracts";
import type { RoleResolution } from "@folio/template";
import { fileName, parentPath } from "../paths.js";

export type TemplateState = {
  scan: TemplateScan;
  inventory: TemplateInventory;
  compiled: CompiledTemplate;
  diagnostics: Diagnostic[];
  resolutions: RoleResolution[];
};

type SetupColumnProps = {
  template: TemplateState | null;
  templatePath: string | null;
  outputPath: string | null;
  busy: boolean;
  progressText: string;
  // A parsed article is the one precondition the publish button cannot show on its own.
  canPublish: boolean;
  hostReady: boolean;
  onChooseTemplate: () => void;
  onChooseOutput: () => void;
  onPublish: () => void;
};

export function SetupColumn({ template, templatePath, outputPath, busy, progressText, canPublish, hostReady, onChooseTemplate, onChooseOutput, onPublish }: SetupColumnProps) {
  const { t } = useTranslation();
  const templateReady = Boolean(template);
  return (
    <div className="setup-column">
      <section className="setup-card panel">
        <div className="panel-heading">
          <div className="panel-title-group"><span className="step-number">02</span><div><h2>{t("app.template.title")}</h2><p>{t("app.template.hint")}</p></div></div>
          <span className={`step-check ${templateReady ? "complete" : ""}`}>{templateReady ? "✓" : "2"}</span>
        </div>
        <button className={`selection-row ${template ? "selected" : ""}`} type="button" onClick={onChooseTemplate} disabled={busy}>
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
        <button className={`selection-row ${outputPath ? "selected" : ""}`} type="button" onClick={onChooseOutput} disabled={busy}>
          <span className="file-icon folder">↗</span>
          <span className="selection-copy"><strong>{outputPath ? fileName(outputPath) : t("app.output.choose")}</strong><small>{outputPath ? parentPath(outputPath) : t("app.output.included")}</small></span>
          <span className="selection-action">{outputPath ? t("app.action.change") : t("app.action.browse")}</span>
        </button>
      </section>

      <section className="publish-card">
        <div className="publish-card-top"><div className="publish-orb"><span>✳</span></div><div><strong>{t("app.publish.ready")}</strong><small>{t("app.publish.hint")}</small></div></div>
        <button className="publish-button" type="button" onClick={onPublish} disabled={busy || !canPublish || !templateReady || !hostReady}>
          <span>{busy ? t("app.publish.working") : t("app.publish.action")}</span><span className="publish-arrow">{busy ? "···" : "↗"}</span>
        </button>
        {busy ? <div className="progress-line"><span className="progress-spinner" />{progressText || t("app.progress.working")}</div> : <div className="publish-hint">{t("app.publish.creates")}</div>}
      </section>
    </div>
  );
}
