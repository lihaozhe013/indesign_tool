use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use rfd::AsyncFileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

mod host_bridge;
mod help;
mod locale;
mod workspace;

/// Returns the stored interface locale, or `None` before the user has chosen one.
#[tauri::command]
fn get_locale(app: AppHandle) -> Option<String> {
    locale::read(&app)
}

#[tauri::command]
fn set_locale(app: AppHandle, locale: String) -> Result<(), String> {
    locale::apply(&app, &locale)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedTextFile {
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostAvailability {
    available: bool,
    version: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostJob {
    schema_version: u32,
    job_id: String,
    action: String,
    payload: Value,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostJobResult {
    schema_version: u32,
    job_id: String,
    status: String,
    diagnostics: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AssetCheck {
    resolved: HashMap<String, String>,
    diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputStage {
    stage_id: String,
    document_path: String,
    pdf_path: String,
    preview_directory: String,
    final_document_path: String,
    final_pdf_path: String,
    final_preview_directory: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostic {
    code: String,
    message: String,
    severity: &'static str,
    path: Option<String>,
}

static HOST_JOB_LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
async fn open_markdown() -> Result<Option<OpenedTextFile>, String> {
    let selected = AsyncFileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .set_title("Open article")
        .pick_file()
        .await;
    let Some(file) = selected else {
        return Ok(None);
    };
    let path = file.path().to_path_buf();
    ensure_extension(&path, &["md", "markdown"])?;
    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    Ok(Some(OpenedTextFile {
        path: path.to_string_lossy().into_owned(),
        content,
    }))
}

#[tauri::command]
async fn save_markdown(path: Option<String>, content: String) -> Result<Option<String>, String> {
    let selected = match path {
        Some(path) => PathBuf::from(path),
        None => {
            let Some(file) = AsyncFileDialog::new()
                .add_filter("Markdown", &["md"])
                .set_file_name("article.md")
                .set_title("Save article")
                .save_file()
                .await
            else {
                return Ok(None);
            };
            file.path().to_path_buf()
        }
    };
    ensure_extension(&selected, &["md", "markdown"])?;
    std::fs::write(&selected, content).map_err(|error| error.to_string())?;
    Ok(Some(selected.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn choose_template() -> Result<Option<String>, String> {
    let selected = AsyncFileDialog::new()
        .add_filter("InDesign documents", &["indd"])
        .set_title("Choose a labeled InDesign template")
        .pick_file()
        .await;
    Ok(selected.map(|file| file.path().to_string_lossy().into_owned()))
}

#[tauri::command]
async fn choose_output() -> Result<Option<String>, String> {
    let selected = AsyncFileDialog::new()
        .add_filter("InDesign document", &["indd"])
        .set_file_name("article.indd")
        .set_title("Save generated document")
        .save_file()
        .await;
    let Some(file) = selected else {
        return Ok(None);
    };
    let mut path = file.path().to_path_buf();
    if path.extension().is_none() {
        path.set_extension("indd");
    }
    ensure_extension(&path, &["indd"])?;
    if path.exists() {
        return Err("Choose a new output filename; existing documents are preserved.".into());
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn check_host() -> HostAvailability {
    #[cfg(target_os = "macos")]
    {
        match host_bridge::read_host_version() {
            Ok(version) => HostAvailability {
                available: true,
                version: Some(version),
                message: None,
            },
            Err(error) => HostAvailability {
                available: false,
                version: None,
                message: Some(error),
            },
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        HostAvailability {
            available: false,
            version: None,
            message: Some("This first release supports macOS only.".into()),
        }
    }
}

#[tauri::command]
async fn run_host_job(app: AppHandle, job: HostJob) -> Result<HostJobResult, String> {
    if job.schema_version != 1 {
        return Err("Unsupported InDesign job schema version.".into());
    }
    if job.job_id.is_empty() || job.job_id.len() > 128 {
        return Err("The InDesign job ID is invalid.".into());
    }
    if !["inspectTemplate", "render", "dump", "export"].contains(&job.action.as_str()) {
        return Err("Unsupported InDesign operation.".into());
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        let _guard = HOST_JOB_LOCK
            .lock()
            .map_err(|_| "InDesign job lock is unavailable".to_string())?;
        host_bridge::run_job(&app, job)
    })
    .await
    .map_err(|error| error.to_string())??;
    Ok(result)
}

#[tauri::command]
fn check_assets(article_path: String, sources: Vec<String>) -> Result<AssetCheck, String> {
    let article_path = PathBuf::from(article_path);
    let parent = article_path
        .parent()
        .ok_or_else(|| "Save the Markdown article before checking image files.".to_string())?;
    let parent = std::fs::canonicalize(parent).map_err(|error| error.to_string())?;
    let mut resolved = HashMap::new();
    let mut diagnostics = Vec::new();
    for source in sources {
        if has_url_scheme(&source) {
            diagnostics.push(Diagnostic {
                code: "Asset.UnsupportedScheme".into(),
                message: format!("Only local relative image assets are supported: {source}"),
                severity: "warning",
                path: Some(source.clone()),
            });
            continue;
        }
        let candidate = parent.join(&source);
        match std::fs::canonicalize(&candidate) {
            Ok(path) if path.is_file() => {
                resolved.insert(source, path.to_string_lossy().into_owned());
            }
            _ => diagnostics.push(Diagnostic {
                code: "Asset.Missing".into(),
                message: format!("Image asset was not found: {source}"),
                severity: "warning",
                path: Some(source),
            }),
        }
    }
    Ok(AssetCheck {
        resolved,
        diagnostics,
    })
}

#[tauri::command]
fn read_markdown_image(article_path: String, source: String) -> Result<String, String> {
    const MAX_IMAGE_BYTES: u64 = 12 * 1024 * 1024;
    if has_url_scheme(&source) || Path::new(&source).is_absolute() {
        return Err("Only local relative image paths are supported.".into());
    }
    let article_path = PathBuf::from(article_path);
    let article_directory = article_path
        .parent()
        .ok_or_else(|| "The Markdown article path is invalid.".to_string())?;
    let article_directory = std::fs::canonicalize(article_directory).map_err(|error| error.to_string())?;
    let image_path = std::fs::canonicalize(article_directory.join(&source)).map_err(|error| error.to_string())?;
    if !image_path.is_file() {
        return Err("The image file was not found.".into());
    }
    let extension = image_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("The image format is not supported in the preview.".into()),
    };
    let mut bytes = Vec::new();
    std::fs::File::open(image_path)
        .map_err(|error| error.to_string())?
        .take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("The image exceeds the 12 MB preview limit.".into());
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
fn prepare_output_stage(output_path: String) -> Result<OutputStage, String> {
    let final_document = PathBuf::from(output_path);
    ensure_extension(&final_document, &["indd"])?;
    let parent = final_document
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err("The output folder does not exist.".into());
    }
    let stem = final_document
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The output document name is invalid.".to_string())?;
    let final_pdf = parent.join(format!("{stem}.pdf"));
    let final_preview = parent.join(format!("{stem}-preview"));
    let final_report = parent.join(format!("{stem}-report.txt"));
    for path in [&final_document, &final_pdf, &final_preview, &final_report] {
        if path.exists() {
            return Err(format!("Output already exists: {}", path.display()));
        }
    }

    let stage_id = Uuid::new_v4().to_string();
    let stage_dir = stage_directory(parent, stem, &stage_id)?;
    let preview_dir = stage_dir.join("preview");
    std::fs::create_dir_all(&preview_dir).map_err(|error| error.to_string())?;
    Ok(OutputStage {
        stage_id,
        document_path: stage_dir
            .join("document.indd")
            .to_string_lossy()
            .into_owned(),
        pdf_path: stage_dir
            .join("document.pdf")
            .to_string_lossy()
            .into_owned(),
        preview_directory: preview_dir.to_string_lossy().into_owned(),
        final_document_path: final_document.to_string_lossy().into_owned(),
        final_pdf_path: final_pdf.to_string_lossy().into_owned(),
        final_preview_directory: final_preview.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn finalize_output_stage(
    app: AppHandle,
    state: State<workspace::WorkspaceState>,
    output_path: String,
    stage_id: String,
    report: String,
    expected_pages: u32,
) -> Result<OutputPaths, String> {
    let files = finalize_stage_files(&output_path, &stage_id, report, expected_pages)?;
    state.set_output(files.clone())?;
    // An already-open preview window refreshes itself from this broadcast; a later opener pulls
    // the stored result instead.
    let _ = app.emit(workspace::OUTPUT_UPDATED_EVENT, files.clone());
    Ok(files)
}

fn finalize_stage_files(
    output_path: &str,
    stage_id: &str,
    report: String,
    expected_pages: u32,
) -> Result<OutputPaths, String> {
    if report.trim().is_empty() {
        return Err("The Chinese report is empty.".into());
    }
    let final_document = PathBuf::from(output_path);
    ensure_extension(&final_document, &["indd"])?;
    let parent = final_document
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let stem = final_document
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The output document name is invalid.".to_string())?;
    let stage_dir = stage_directory(parent, stem, &stage_id)?;
    let stage_document = stage_dir.join("document.indd");
    let stage_pdf = stage_dir.join("document.pdf");
    let stage_preview = stage_dir.join("preview");
    let final_pdf = parent.join(format!("{stem}.pdf"));
    let final_preview = parent.join(format!("{stem}-preview"));
    let final_report = parent.join(format!("{stem}-report.txt"));
    let stage_report = stage_dir.join("report.txt");

    require_nonempty_file(&stage_document, "InDesign document")?;
    let pdf_available = stage_pdf.is_file()
        && std::fs::metadata(&stage_pdf).map(|meta| meta.len() > 0).unwrap_or(false);
    let mut preview_pages = Vec::new();
    let mut finalization_warnings = Vec::new();
    if !pdf_available {
        finalization_warnings.push("PDF 未生成或为空文件，INDD 已保留。".to_string());
    }
    if stage_preview.is_dir() {
        match std::fs::read_dir(&stage_preview) {
            Ok(entries) => for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
                let page = name.strip_prefix("page-").and_then(|value| value.strip_suffix(".png"))
                    .and_then(|value| value.parse::<u32>().ok());
                if let Some(page) = page {
                    if path.is_file() && std::fs::metadata(&path).map(|meta| meta.len() > 0).unwrap_or(false) {
                        preview_pages.push(page);
                    } else {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            },
            Err(error) => finalization_warnings.push(format!("无法检查页面预览目录：{error}")),
        }
    }
    preview_pages.sort_unstable();
    preview_pages.dedup();
    if preview_pages.len() < expected_pages as usize {
        finalization_warnings.push(format!("页面预览仅成功生成 {} / {} 页。", preview_pages.len(), expected_pages));
    }
    for path in [&final_document, &final_report] {
        if path.exists() {
            return Err(format!("Output already exists: {}", path.display()));
        }
    }
    if pdf_available && final_pdf.exists() {
        return Err(format!("Output already exists: {}", final_pdf.display()));
    }
    if !preview_pages.is_empty() && final_preview.exists() {
        return Err(format!("Output already exists: {}", final_preview.display()));
    }
    std::fs::rename(&stage_document, &final_document)
        .map_err(|error| format!("Could not finalize generated InDesign document: {error}"))?;
    let pdf_moved = if pdf_available {
        match std::fs::rename(&stage_pdf, &final_pdf) {
            Ok(()) => true,
            Err(error) => {
                finalization_warnings.push(format!("PDF 文件整理失败：{error}"));
                false
            }
        }
    } else { false };
    let preview_moved = if !preview_pages.is_empty() {
        match std::fs::rename(&stage_preview, &final_preview) {
            Ok(()) => true,
            Err(error) => {
                finalization_warnings.push(format!("页面预览整理失败：{error}"));
                preview_pages.clear();
                false
            }
        }
    } else { false };
    let mut report = report;
    if !finalization_warnings.is_empty() {
        report.push_str("\n\n成果整理提示：\n");
        for warning in &finalization_warnings { report.push_str(&format!("- {warning}\n")); }
    }
    report.push_str("\n最终文件清单：\n");
    report.push_str(&format!("- INDD：{}\n", final_document.display()));
    if pdf_moved {
        report.push_str(&format!("- PDF：{}\n", final_pdf.display()));
    } else {
        report.push_str("- PDF：未生成\n");
    }
    if preview_moved {
        report.push_str(&format!("- 页面预览目录：{}\n- 成功页面：{}\n", final_preview.display(), preview_pages.iter().map(u32::to_string).collect::<Vec<_>>().join("、")));
    } else {
        report.push_str("- 页面预览：未生成\n");
    }
    report.push_str(&format!("- 检查报告：{}\n", final_report.display()));
    let report_result = std::fs::write(&stage_report, report.as_bytes())
        .and_then(|_| std::fs::rename(&stage_report, &final_report));
    if let Err(error) = report_result {
        let _ = std::fs::remove_file(&final_document);
        if pdf_moved { let _ = std::fs::remove_file(&final_pdf); }
        if preview_moved { let _ = std::fs::remove_dir_all(&final_preview); }
        return Err(format!("Could not finalize the required Chinese report: {error}"));
    }
    let _ = std::fs::remove_dir_all(&stage_dir);
    Ok(OutputPaths {
        document_path: final_document.to_string_lossy().into_owned(),
        pdf_path: pdf_moved.then(|| final_pdf.to_string_lossy().into_owned()),
        preview_directory: preview_moved.then(|| final_preview.to_string_lossy().into_owned()),
        preview_pages,
        report_path: final_report.to_string_lossy().into_owned(),
        finalization_warnings,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputPaths {
    document_path: String,
    pdf_path: Option<String>,
    preview_directory: Option<String>,
    preview_pages: Vec<u32>,
    report_path: String,
    finalization_warnings: Vec<String>,
}

#[tauri::command]
fn discard_output_stage(output_path: String, stage_id: String) -> Result<(), String> {
    let final_document = PathBuf::from(output_path);
    ensure_extension(&final_document, &["indd"])?;
    let parent = final_document
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let stem = final_document
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The output document name is invalid.".to_string())?;
    let stage_dir = stage_directory(parent, stem, &stage_id)?;
    if stage_dir.exists() {
        std::fs::remove_dir_all(stage_dir).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn read_preview(path: String) -> Result<String, String> {
    let preview_path = PathBuf::from(path);
    ensure_extension(&preview_path, &["png"])?;
    let metadata = std::fs::metadata(&preview_path).map_err(|error| error.to_string())?;
    if metadata.len() > 12 * 1024 * 1024 {
        return Err("Preview image exceeds the 12 MB limit.".into());
    }
    let bytes = std::fs::read(preview_path).map_err(|error| error.to_string())?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[tauri::command]
async fn open_output(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err("The output file no longer exists.".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening output files is supported on macOS only in this release.".into())
    }
}

/// Creates or focuses the auxiliary preview/report window. Window titles stay bilingual like
/// the Help menu item, because native titles are set before the WebView can translate them.
#[tauri::command]
fn open_aux_window(app: AppHandle, kind: String) -> Result<(), String> {
    let (label, file, title, size, min_size) = match kind.as_str() {
        "preview" => (
            "preview",
            "preview.html",
            "Folio · Page Preview / 页面预览",
            (960.0, 700.0),
            (620.0, 460.0),
        ),
        "report" => (
            "report",
            "report.html",
            "Folio · Checks Report / 检查报告",
            (820.0, 640.0),
            (560.0, 420.0),
        ),
        other => return Err(format!("Unknown auxiliary window kind: {other}")),
    };
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.unminimize();
        existing.show().map_err(|error| error.to_string())?;
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(file.into()))
        .title(title)
        .inner_size(size.0, size.1)
        .min_inner_size(min_size.0, min_size.1)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// The main window owns the live diagnostic list; the report window pulls it and listens for
/// these pushes. Storing it in shared state keeps window startup free of event races.
#[tauri::command]
fn remember_report(
    app: AppHandle,
    state: State<workspace::WorkspaceState>,
    diagnostics: Vec<workspace::ClientDiagnostic>,
) -> Result<(), String> {
    state.set_report(diagnostics.clone())?;
    app.emit(workspace::REPORT_UPDATED_EVENT, diagnostics)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_last_report(state: State<workspace::WorkspaceState>) -> Vec<workspace::ClientDiagnostic> {
    state.report()
}

#[tauri::command]
fn get_last_output(state: State<workspace::WorkspaceState>) -> Option<OutputPaths> {
    state.output()
}

fn ensure_extension(path: &PathBuf, allowed: &[&str]) -> Result<(), String> {    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if allowed.contains(&extension.as_str()) {
        Ok(())
    } else {
        Err(format!("Unsupported file type: .{extension}"))
    }
}

fn has_url_scheme(source: &str) -> bool {
    source
        .split_once(':')
        .map(|(scheme, _remainder)| {
            !scheme.is_empty()
                && scheme.chars().enumerate().all(|(index, character)| {
                    character.is_ascii_alphanumeric()
                        || (index > 0 && matches!(character, '+' | '.' | '-'))
                })
        })
        .unwrap_or(false)
}

fn stage_directory(parent: &Path, stem: &str, stage_id: &str) -> Result<PathBuf, String> {
    Uuid::parse_str(stage_id).map_err(|_| "The output staging ID is invalid.".to_string())?;
    Ok(parent.join(format!(".{stem}.folio-stage-{stage_id}")))
}

fn require_nonempty_file(path: &Path, label: &str) -> Result<(), String> {
    let metadata =
        std::fs::metadata(path).map_err(|error| format!("{label} was not generated: {error}"))?;
    if metadata.is_file() && metadata.len() > 0 {
        Ok(())
    } else {
        Err(format!("{label} is empty or invalid."))
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(workspace::WorkspaceState::default())
        .invoke_handler(tauri::generate_handler![
            open_markdown,
            save_markdown,
            choose_template,
            choose_output,
            check_host,
            run_host_job,
            read_preview,
            read_markdown_image,
            open_output,
            check_assets,
            prepare_output_stage,
            finalize_output_stage,
            discard_output_stage,
            open_aux_window,
            remember_report,
            get_last_report,
            get_last_output,
            get_locale,
            set_locale
        ])
        .setup(|app| {
            locale::attach_menu_items(app.handle())?;
            help::attach_menu_item(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if help::is_manual_menu_id(id) {
                if let Err(error) = help::open_manual() {
                    eprintln!("Could not open the user manual: {error}");
                }
            } else if let Some(locale) = locale::from_menu_id(id) {
                if let Err(error) = locale::apply(app, locale) {
                    eprintln!("Could not apply interface locale {locale}: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Folio");
}

#[cfg(test)]
mod tests {
    use super::{ensure_extension, finalize_stage_files, has_url_scheme, prepare_output_stage};
    use std::fs;
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn accepts_markdown_extensions_case_insensitively() {
        assert!(ensure_extension(&PathBuf::from("article.MD"), &["md", "markdown"]).is_ok());
        assert!(ensure_extension(&PathBuf::from("article.markdown"), &["md", "markdown"]).is_ok());
    }

    #[test]
    fn rejects_unexpected_extensions() {
        assert!(ensure_extension(&PathBuf::from("article.txt"), &["md", "markdown"]).is_err());
    }

    #[test]
    fn accepts_relative_local_asset_references_and_rejects_urls() {
        assert!(!has_url_scheme("images/cover.png"));
        assert!(!has_url_scheme("../assets/cover.png"));
        assert!(has_url_scheme("https://example.test/cover.png"));
        assert!(has_url_scheme("data:image/png;base64,AAAA"));
    }

    #[test]
    fn reports_missing_and_unsupported_images_as_warnings() {
        let root = std::env::temp_dir().join(format!("folio-assets-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let article = root.join("article.md");
        fs::write(&article, "article").unwrap();
        let result = super::check_assets(
            article.to_string_lossy().into_owned(),
            vec!["missing.png".into(), "https://example.test/image.png".into()],
        ).unwrap();
        assert!(result.resolved.is_empty());
        assert_eq!(result.diagnostics.iter().map(|item| item.severity).collect::<Vec<_>>(), vec!["warning", "warning"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finalizes_a_complete_output_set() {
        let root = std::env::temp_dir().join(format!("folio-stage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("article.indd");
        let stage = prepare_output_stage(output.to_string_lossy().into_owned()).unwrap();
        fs::write(&stage.document_path, b"indesign-document").unwrap();
        fs::write(&stage.pdf_path, b"pdf-document").unwrap();
        fs::write(
            PathBuf::from(&stage.preview_directory).join("page-001.png"),
            b"preview-one",
        )
        .unwrap();
        fs::write(
            PathBuf::from(&stage.preview_directory).join("page-002.png"),
            b"preview-two",
        )
        .unwrap();

        let files = finalize_stage_files(&output.to_string_lossy().into_owned(), &stage.stage_id, "报告".into(), 2)
            .unwrap();
        assert!(PathBuf::from(files.document_path).is_file());
        assert!(PathBuf::from(files.pdf_path.unwrap()).is_file());
        assert_eq!(files.preview_pages, vec![1, 2]);
        assert_eq!(fs::read_dir(files.preview_directory.unwrap()).unwrap().count(), 2);
        assert!(PathBuf::from(files.report_path).is_file());
        assert!(files.finalization_warnings.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preserves_document_and_report_without_optional_exports() {
        let root = std::env::temp_dir().join(format!("folio-stage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("article.indd");
        let stage = prepare_output_stage(output.to_string_lossy().into_owned()).unwrap();
        fs::write(&stage.document_path, b"indesign-document").unwrap();
        let files = finalize_stage_files(&output.to_string_lossy().into_owned(), &stage.stage_id, "仅 INDD".into(), 2).unwrap();
        assert!(output.is_file());
        assert!(files.pdf_path.is_none());
        assert!(files.preview_directory.is_none());
        assert!(files.preview_pages.is_empty());
        assert!(PathBuf::from(files.report_path).is_file());
        assert_eq!(files.finalization_warnings.len(), 2);
        assert!(!root.join("article.pdf").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preserves_pdf_and_only_nonempty_preview_pages() {
        let root = std::env::temp_dir().join(format!("folio-stage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("article.indd");
        let stage = prepare_output_stage(output.to_string_lossy().into_owned()).unwrap();
        fs::write(&stage.document_path, b"indesign-document").unwrap();
        fs::write(&stage.pdf_path, b"pdf-document").unwrap();
        fs::write(
            PathBuf::from(&stage.preview_directory).join("page-001.png"),
            b"preview-one",
        )
        .unwrap();
        fs::write(PathBuf::from(&stage.preview_directory).join("page-002.png"), b"").unwrap();

        let files = finalize_stage_files(&output.to_string_lossy().into_owned(), &stage.stage_id, "部分预览".into(), 2).unwrap();
        assert!(output.is_file());
        assert!(files.pdf_path.unwrap().ends_with("article.pdf"));
        assert_eq!(files.preview_pages, vec![1]);
        assert!(PathBuf::from(files.preview_directory.unwrap()).join("page-001.png").is_file());
        assert_eq!(files.finalization_warnings.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn does_not_publish_an_empty_indesign_document() {
        let root = std::env::temp_dir().join(format!("folio-stage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("article.indd");
        let stage = prepare_output_stage(output.to_string_lossy().into_owned()).unwrap();
        fs::write(&stage.document_path, b"").unwrap();
        let error = finalize_stage_files(&output.to_string_lossy().into_owned(), &stage.stage_id, "报告".into(), 1).unwrap_err();
        assert!(error.contains("InDesign document is empty"));
        assert!(!output.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
