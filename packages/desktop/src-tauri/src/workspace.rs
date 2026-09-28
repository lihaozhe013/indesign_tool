use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::OutputPaths;

/// Emitted after a publish has been finalized so an open preview window can refresh itself.
pub const OUTPUT_UPDATED_EVENT: &str = "output-updated";

/// Emitted whenever the main window pushes a fresh diagnostic list for the report window.
pub const REPORT_UPDATED_EVENT: &str = "report-updated";

/// Diagnostics as reported by the WebView. The shared contract validates severity and shape
/// before the list is stored; this struct only carries it across the boundary unchanged.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub context: Option<Value>,
}

/// Shared state that the auxiliary preview and report windows read from. They pull on demand
/// instead of racing events fired before the new window has finished loading its JavaScript.
#[derive(Default)]
pub struct WorkspaceState {
    output: Mutex<Option<OutputPaths>>,
    report: Mutex<Vec<ClientDiagnostic>>,
}

impl WorkspaceState {
    pub fn set_output(&self, output: OutputPaths) -> Result<(), String> {
        let mut guard = self
            .output
            .lock()
            .map_err(|_| LOCK_UNAVAILABLE.to_string())?;
        *guard = Some(output);
        Ok(())
    }

    pub fn output(&self) -> Option<OutputPaths> {
        self.output.lock().ok().and_then(|guard| guard.clone())
    }

    pub fn set_report(&self, report: Vec<ClientDiagnostic>) -> Result<(), String> {
        let mut guard = self
            .report
            .lock()
            .map_err(|_| LOCK_UNAVAILABLE.to_string())?;
        *guard = report;
        Ok(())
    }

    pub fn report(&self) -> Vec<ClientDiagnostic> {
        self.report
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }
}

const LOCK_UNAVAILABLE: &str = "Workspace state is unavailable.";

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::{ClientDiagnostic, WorkspaceState};

    #[test]
    fn stores_and_returns_the_latest_output_and_report() {
        let state = WorkspaceState::default();
        assert!(state.output().is_none());
        assert!(state.report().is_empty());

        let diagnostic = ClientDiagnostic {
            code: "Font.Missing".into(),
            message: "A template font is missing.".into(),
            severity: "warning".into(),
            path: Some("pages.1".into()),
            context: Some(serde_json::json!({ "role": "Body" })),
        };
        state.set_report(vec![diagnostic.clone()]).unwrap();
        assert_eq!(state.report().len(), 1);
        assert_eq!(state.report()[0].code, "Font.Missing");
        assert_eq!(
            state.report()[0].context,
            Some(Value::from(serde_json::json!({ "role": "Body" })))
        );

        // A push replaces the previous report instead of accumulating stale checks.
        state.set_report(Vec::new()).unwrap();
        assert!(state.report().is_empty());
    }

    #[test]
    fn deserializes_webview_diagnostics_with_optional_fields() {
        let diagnostic: ClientDiagnostic = serde_json::from_str(
            r#"{"code":"Article.TitleMissing","message":"No title found.","severity":"warning"}"#,
        )
        .unwrap();
        assert_eq!(diagnostic.path, None);
        assert_eq!(diagnostic.context, None);
    }
}
