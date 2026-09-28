use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{HostJob, HostJobResult};

const HOST_APP_NAME: &str = "Adobe InDesign 2026";
const JOB_TIMEOUT: Duration = Duration::from_secs(180);

pub fn read_host_version() -> Result<String, String> {
    let output = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            &format!("tell application \"{HOST_APP_NAME}\" to get version"),
        ])
        .output()
        .map_err(|error| format!("Could not contact InDesign: {error}"))?;
    if !output.status.success() {
        return Err(format_apple_event_failure(
            "Could not contact InDesign",
            &String::from_utf8_lossy(&output.stderr),
        ));
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        Err("InDesign did not return its version.".into())
    } else {
        Ok(version)
    }
}

pub fn run_job(app: &AppHandle, job: HostJob) -> Result<HostJobResult, String> {
    let job_id = Uuid::parse_str(&job.job_id)
        .map_err(|_| "The InDesign job ID must be a UUID.".to_string())?;
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Could not locate the application cache: {error}"))?
        .join("host-jobs")
        .join(job_id.to_string());
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create InDesign job folder: {error}"))?;

    let job_path = root.join("job.json");
    let script_path = root.join("run.idjs");
    let result_path = root.join("result.json");
    let done_path = root.join("done.txt");
    fs::write(
        &job_path,
        serde_json::to_vec_pretty(&job).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Could not write InDesign job: {error}"))?;
    let script = build_script(&job_path, &result_path, &done_path, &job.job_id)?;
    fs::write(&script_path, script)
        .map_err(|error| format!("Could not write InDesign script: {error}"))?;

    execute_script(&script_path, &done_path, JOB_TIMEOUT)?;
    let result_bytes = fs::read(&result_path)
        .map_err(|error| format!("InDesign finished without a readable result file: {error}"))?;
    let result = parse_result(&result_bytes, &job.job_id)?;
    fs::remove_dir_all(&root)
        .map_err(|error| format!("Could not clean completed InDesign job files: {error}"))?;
    Ok(result)
}

fn build_script(
    job_path: &Path,
    result_path: &Path,
    done_path: &Path,
    job_id: &str,
) -> Result<String, String> {
    let mut source = include_str!("../../../../packages/indesign/src/host-runner.idjs").to_string();
    let paths = [job_path, result_path, done_path]
        .map(|path| {
            serde_json::to_string(&path.to_string_lossy()).map_err(|error| error.to_string())
        })
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    let id = serde_json::to_string(job_id).map_err(|error| error.to_string())?;
    source.push_str("\nawait globalThis.FolioHostRunner.runHostJob(");
    source.push_str(&paths[0]);
    source.push(',');
    source.push_str(&paths[1]);
    source.push(',');
    source.push_str(&paths[2]);
    source.push(',');
    source.push_str(&id);
    source.push_str(");\n");
    Ok(source)
}

fn execute_script(script_path: &Path, done_path: &Path, timeout: Duration) -> Result<(), String> {
    let script_literal = applescript_string(&script_path.to_string_lossy());
    let apple_script = format!(
        "tell application \"{HOST_APP_NAME}\" to do script POSIX file \"{script_literal}\" language uxpscript"
    );
    let mut child = Command::new("/usr/bin/osascript")
        .args(["-e", &apple_script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start InDesign: {error}"))?;
    wait_for_completion(&mut child, done_path, timeout)
}

fn wait_for_completion(
    child: &mut std::process::Child,
    done_path: &Path,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        let status = child.try_wait().map_err(|error| error.to_string())?;
        if done_path.exists() {
            if let Some(status) = status {
                if !status.success() {
                    return Err(format_apple_event_failure(
                        "InDesign script launcher failed",
                        &child_error(child),
                    ));
                }
                return Ok(());
            }
        } else if status.is_some_and(|status| !status.success()) {
            let detail = child_error(child);
            return Err(format_apple_event_failure(
                "InDesign script launcher failed",
                &detail,
            ));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("InDesign script timed out after {timeout:?}."));
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn parse_result(bytes: &[u8], expected_job_id: &str) -> Result<HostJobResult, String> {
    let result: HostJobResult = serde_json::from_slice(bytes)
        .map_err(|error| format!("InDesign returned a damaged job result: {error}"))?;
    validate_result(&result, expected_job_id)?;
    Ok(result)
}

fn child_error(child: &mut std::process::Child) -> String {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    if let Some(mut pipe) = child.stdout.take() {
        let _ = pipe.read_to_end(&mut stdout);
    }
    if let Some(mut pipe) = child.stderr.take() {
        let _ = pipe.read_to_end(&mut stderr);
    }
    let output = String::from_utf8_lossy(&stderr).trim().to_string();
    if output.is_empty() {
        String::from_utf8_lossy(&stdout).trim().to_string()
    } else {
        output
    }
}

fn applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn format_apple_event_failure(context: &str, detail: &str) -> String {
    let normalized = detail.to_ascii_lowercase();
    if normalized.contains("-1743") || normalized.contains("not authorized to send apple events") {
        format!(
            "InDesign control permission was denied. In System Settings > Privacy & Security > Automation, allow Folio to control Adobe InDesign 2026, then refresh the connection. ({detail})"
        )
    } else {
        format!("{context}: {}", detail.trim())
    }
}

fn validate_result(result: &HostJobResult, expected_job_id: &str) -> Result<(), String> {
    if result.schema_version != 1 {
        return Err("InDesign returned an unsupported result schema.".into());
    }
    if result.job_id != expected_job_id {
        return Err("InDesign returned a result for a different job.".into());
    }
    if !["succeeded", "failed"].contains(&result.status.as_str()) {
        return Err("InDesign returned an invalid job status.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    use super::wait_for_completion;
    use super::{applescript_string, build_script, parse_result, validate_result};
    use crate::HostJobResult;
    #[cfg(target_os = "macos")]
    use std::fs;
    use std::path::Path;
    #[cfg(target_os = "macos")]
    use std::time::Duration;

    #[test]
    fn escapes_applescript_paths() {
        assert_eq!(
            applescript_string("/tmp/A \"B\"\\C"),
            "/tmp/A \\\"B\\\"\\\\C"
        );
    }

    #[test]
    fn explains_how_to_recover_from_denied_apple_events_permission() {
        let error = super::format_apple_event_failure(
            "Could not contact InDesign",
            "Not authorized to send Apple events (-1743)",
        );
        assert!(error.contains("Privacy & Security > Automation"));
        assert!(error.contains("Adobe InDesign 2026"));
        assert!(error.contains("allow Folio to control"));
    }

    #[test]
    fn generated_script_uses_top_level_await_and_its_own_job_files() {
        let script = build_script(
            Path::new("/tmp/job-1/job.json"),
            Path::new("/tmp/job-1/result.json"),
            Path::new("/tmp/job-1/done.txt"),
            "00000000-0000-4000-8000-000000000001",
        )
        .unwrap();
        assert!(script.contains("await globalThis.FolioHostRunner.runHostJob("));
        assert!(script.contains("/tmp/job-1/job.json"));
        assert!(script.contains("/tmp/job-1/result.json"));
        assert!(script.contains("/tmp/job-1/done.txt"));
    }

    #[test]
    fn rejects_mismatched_and_unsupported_results() {
        let result = HostJobResult {
            schema_version: 1,
            job_id: "other".into(),
            status: "succeeded".into(),
            diagnostics: vec![],
            payload: None,
        };
        assert!(validate_result(&result, "expected")
            .unwrap_err()
            .contains("different job"));
        let invalid = HostJobResult {
            status: "unknown".into(),
            ..result
        };
        assert!(validate_result(&invalid, "other")
            .unwrap_err()
            .contains("invalid job status"));
    }

    #[test]
    fn rejects_damaged_and_unsupported_result_files() {
        assert!(parse_result(b"{broken", "expected")
            .unwrap_err()
            .contains("damaged job result"));
        let result = serde_json::json!({
            "schemaVersion": 2,
            "jobId": "expected",
            "status": "succeeded",
            "diagnostics": []
        });
        assert!(
            parse_result(&serde_json::to_vec(&result).unwrap(), "expected")
                .unwrap_err()
                .contains("unsupported result schema")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn waits_for_a_completion_marker_after_the_launcher_exits() {
        let root = std::env::temp_dir().join(format!("folio-host-job-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let mut child = std::process::Command::new("/usr/bin/true").spawn().unwrap();
        let error = wait_for_completion(&mut child, &root.join("done.txt"), Duration::from_secs(1))
            .unwrap_err();
        assert!(error.contains("timed out"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reports_a_failed_launcher_without_waiting_for_the_job_timeout() {
        let root = std::env::temp_dir().join(format!("folio-host-job-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let mut child = std::process::Command::new("/usr/bin/false")
            .spawn()
            .unwrap();
        let error =
            wait_for_completion(&mut child, &root.join("done.txt"), Duration::from_secs(10))
                .unwrap_err();
        assert!(error.contains("InDesign script launcher failed"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn kills_a_launcher_after_the_host_timeout() {
        let root = std::env::temp_dir().join(format!("folio-host-job-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let mut child = std::process::Command::new("/bin/sleep")
            .arg("5")
            .spawn()
            .unwrap();
        let error = wait_for_completion(
            &mut child,
            &root.join("done.txt"),
            Duration::from_millis(50),
        )
        .unwrap_err();
        assert!(error.contains("timed out after 50ms"));
        fs::remove_dir_all(root).unwrap();
    }
}
