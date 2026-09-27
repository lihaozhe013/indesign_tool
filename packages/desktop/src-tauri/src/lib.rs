use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use rfd::AsyncFileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use uuid::Uuid;

mod host_bridge;
mod help;
mod locale;

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
                severity: "error",
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
                severity: "error",
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
    for path in [&final_document, &final_pdf, &final_preview] {
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
    output_path: String,
    stage_id: String,
    expected_pages: u32,
) -> Result<OutputPaths, String> {
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

    require_nonempty_file(&stage_document, "InDesign document")?;
    require_nonempty_file(&stage_pdf, "PDF")?;
    if !stage_preview.is_dir() {
        return Err("The page preview folder is missing.".into());
    }
    let preview_count = std::fs::read_dir(&stage_preview)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("png"))
                .unwrap_or(false)
        })
        .count();
    if preview_count != expected_pages as usize {
        return Err(format!(
            "Expected {expected_pages} page previews but found {preview_count}."
        ));
    }
    for page in 1..=expected_pages {
        let preview = stage_preview.join(format!("page-{page:03}.png"));
        require_nonempty_file(&preview, "Page preview")?;
    }
    for path in [&final_document, &final_pdf, &final_preview] {
        if path.exists() {
            return Err(format!("Output already exists: {}", path.display()));
        }
    }

    let mut moved_document = false;
    let mut moved_pdf = false;
    let mut moved_preview = false;
    let move_result = (|| {
        std::fs::rename(&stage_document, &final_document)?;
        moved_document = true;
        std::fs::rename(&stage_pdf, &final_pdf)?;
        moved_pdf = true;
        std::fs::rename(&stage_preview, &final_preview)?;
        moved_preview = true;
        Ok::<(), std::io::Error>(())
    })();
    if let Err(error) = move_result {
        if moved_document {
            let _ = std::fs::remove_file(&final_document);
        }
        if moved_pdf {
            let _ = std::fs::remove_file(&final_pdf);
        }
        if moved_preview {
            let _ = std::fs::remove_dir_all(&final_preview);
        }
        return Err(format!("Could not finalize generated files: {error}"));
    }
    let _ = std::fs::remove_dir_all(&stage_dir);
    Ok(OutputPaths {
        document_path: final_document.to_string_lossy().into_owned(),
        pdf_path: final_pdf.to_string_lossy().into_owned(),
        preview_directory: final_preview.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputPaths {
    document_path: String,
    pdf_path: String,
    preview_directory: String,
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

fn ensure_extension(path: &PathBuf, allowed: &[&str]) -> Result<(), String> {
    let extension = path
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
    Ok(parent.join(format!(".{stem}.publisher-stage-{stage_id}")))
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
        .invoke_handler(tauri::generate_handler![
            open_markdown,
            save_markdown,
            choose_template,
            choose_output,
            check_host,
            run_host_job,
            read_preview,
            open_output,
            check_assets,
            prepare_output_stage,
            finalize_output_stage,
            discard_output_stage,
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
    use super::{ensure_extension, finalize_output_stage, has_url_scheme, prepare_output_stage};
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
    fn finalizes_only_a_complete_staged_output_set() {
        let root = std::env::temp_dir().join(format!("publisher-stage-test-{}", Uuid::new_v4()));
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

        let files = finalize_output_stage(output.to_string_lossy().into_owned(), stage.stage_id, 2)
            .unwrap();
        assert!(PathBuf::from(files.document_path).is_file());
        assert!(PathBuf::from(files.pdf_path).is_file());
        assert_eq!(fs::read_dir(files.preview_directory).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_an_incomplete_staged_preview_set_without_publishing_files() {
        let root = std::env::temp_dir().join(format!("publisher-stage-test-{}", Uuid::new_v4()));
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

        let error = finalize_output_stage(output.to_string_lossy().into_owned(), stage.stage_id, 2)
            .unwrap_err();
        assert!(error.contains("Expected 2 page previews"));
        assert!(!output.exists());
        assert!(!root.join("article.pdf").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_an_empty_page_preview_without_publishing_files() {
        let root = std::env::temp_dir().join(format!("publisher-stage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let output = root.join("article.indd");
        let stage = prepare_output_stage(output.to_string_lossy().into_owned()).unwrap();
        fs::write(&stage.document_path, b"indesign-document").unwrap();
        fs::write(&stage.pdf_path, b"pdf-document").unwrap();
        fs::write(
            PathBuf::from(&stage.preview_directory).join("page-001.png"),
            b"",
        )
        .unwrap();

        let error = finalize_output_stage(output.to_string_lossy().into_owned(), stage.stage_id, 1)
            .unwrap_err();
        assert!(error.contains("Page preview is empty or invalid"));
        assert!(!output.exists());
        assert!(!root.join("article.pdf").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
