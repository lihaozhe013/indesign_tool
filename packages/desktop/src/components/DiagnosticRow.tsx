import type { Diagnostic } from "@folio/contracts";

export function DiagnosticRow({ diagnostic, message }: { diagnostic: Diagnostic; message: string }) {
  return (
    <div className={`diagnostic-row ${diagnostic.severity}`}>
      <span className="diagnostic-marker">{diagnostic.severity === "error" ? "!" : diagnostic.severity === "warning" ? "△" : "i"}</span>
      <div>
        <strong>{message}</strong>
        {diagnostic.path && <small>{diagnostic.path}</small>}
      </div>
      <span className="diagnostic-code">{diagnostic.code}</span>
    </div>
  );
}
