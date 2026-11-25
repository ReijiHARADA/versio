use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_DROPPED_PDF_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PAPER_ID_LEN: usize = 128;

pub fn is_safe_paper_id(paper_id: &str) -> bool {
    if paper_id.is_empty() || paper_id.len() > MAX_PAPER_ID_LEN {
        return false;
    }
    if paper_id == "." || paper_id == ".." {
        return false;
    }
    if paper_id.contains('/') || paper_id.contains('\\') {
        return false;
    }
    if !paper_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }
    let mut components = Path::new(paper_id).components();
    match components.next() {
        Some(Component::Normal(name)) => {
            components.next().is_none() && name.to_str() == Some(paper_id)
        }
        _ => false,
    }
}

fn paper_dir(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    if !is_safe_paper_id(paper_id) {
        return Err("無効な論文IDです".into());
    }
    let root = if matches!(std::env::var("VERSIO_ACCEPTANCE"), Ok(v) if v == "1" || v.eq_ignore_ascii_case("true"))
    {
        std::env::var("VERSIO_ACCEPTANCE_HOME")
            .ok()
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| app.path().app_data_dir().ok())
            .ok_or_else(|| "app data directory unavailable".to_string())?
    } else if matches!(std::env::var("VERSIO_UI_E2E"), Ok(v) if v == "1" || v.eq_ignore_ascii_case("true"))
    {
        std::env::var("VERSIO_UI_E2E_HOME")
            .ok()
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| app.path().app_data_dir().ok())
            .ok_or_else(|| "app data directory unavailable".to_string())?
    } else {
        app.path().app_data_dir().map_err(|e| e.to_string())?
    };
    let papers_root = root.join("papers");
    let root = papers_root.join(paper_id);
    if root.parent() != Some(papers_root.as_path()) {
        return Err("無効な論文IDです".into());
    }
    Ok(root)
}

fn require_readable_pdf(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_absolute() {
        return Err("PDFパスは絶対パスである必要があります".into());
    }
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("無効なPDFパスです".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "pdf" {
        return Err("PDFファイルのみ読み込めます".into());
    }
    if !p.is_file() {
        return Err("PDFファイルが見つかりません".into());
    }
    Ok(p)
}

#[tauri::command]
pub fn save_source_pdf(app: AppHandle, paper_id: String, data: Vec<u8>) -> Result<String, String> {
    let dir = paper_dir(&app, &paper_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("source.pdf");
    fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn copy_source_pdf(
    app: AppHandle,
    paper_id: String,
    source_path: String,
) -> Result<String, String> {
    let source = require_readable_pdf(&source_path)?;
    let dir = paper_dir(&app, &paper_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("source.pdf");
    fs::copy(&source, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

/// Optional region for a future bbox highlight pass. Geometry is accepted now
/// so the frontend/Rust contract stays stable; only `page` is used for open.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct SourcePdfHighlight {
    pub page: u32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn resolve_target_page(page: Option<u32>, highlight: Option<&SourcePdfHighlight>) -> Option<u32> {
    if let Some(h) = highlight {
        if h.page >= 1 {
            return Some(h.page);
        }
    }
    page.filter(|p| *p >= 1)
}

#[cfg(target_os = "macos")]
fn open_pdf_path(path: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Best-effort Preview page jump. Falls back silently if Accessibility is off
/// or the viewer is not Preview — the PDF is already open.
#[cfg(target_os = "macos")]
fn try_preview_go_to_page(page: u32) -> Result<(), String> {
    let script = format!(
        r#"try
  tell application "Preview" to activate
  delay 0.35
  tell application "System Events"
    tell process "Preview"
      set frontmost to true
      keystroke "g" using {{option down, command down}}
      delay 0.2
      keystroke "{page}"
      key code 36
    end tell
  end tell
end try"#
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output();
    Ok(())
}

#[tauri::command]
pub fn open_source_pdf(
    app: AppHandle,
    paper_id: String,
    page: Option<u32>,
    highlight: Option<SourcePdfHighlight>,
) -> Result<(), String> {
    let path = paper_dir(&app, &paper_id)?.join("source.pdf");
    if !path.exists() {
        return Err("保存されたPDFが見つかりません".into());
    }
    let target_page = resolve_target_page(page, highlight.as_ref());
    #[cfg(target_os = "macos")]
    {
        open_pdf_path(&path)?;
        if let Some(p) = target_page {
            let _ = try_preview_go_to_page(p);
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, target_page);
        Err("このOSでは元PDFを開く操作に未対応です".into())
    }
}

#[tauri::command]
pub fn delete_source_pdf(app: AppHandle, paper_id: String) -> Result<(), String> {
    let dir = paper_dir(&app, &paper_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn source_pdf_exists(app: AppHandle, paper_id: String) -> Result<bool, String> {
    Ok(paper_dir(&app, &paper_id)?.join("source.pdf").exists())
}

#[tauri::command]
pub fn read_dropped_pdf(path: String) -> Result<tauri::ipc::Response, String> {
    let file_path = require_readable_pdf(&path)?;
    let size = fs::metadata(&file_path).map_err(|e| e.to_string())?.len();
    if size > MAX_DROPPED_PDF_BYTES {
        return Err("PDFが大きすぎます（100MBまで）".into());
    }
    fs::read(&file_path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

/// Opt-in packaged acceptance: returns fixture path only when VERSIO_ACCEPTANCE=1.
#[tauri::command]
pub fn acceptance_fixture_path() -> Option<String> {
    match std::env::var("VERSIO_ACCEPTANCE") {
        Ok(v) if v == "1" || v.eq_ignore_ascii_case("true") => {
            std::env::var("VERSIO_ACCEPTANCE_FIXTURE").ok()
        }
        _ => None,
    }
}

/// Opt-in UI E2E: Accessibility-driven harness (not service-call acceptance).
#[tauri::command]
pub fn ui_e2e_enabled() -> bool {
    matches!(std::env::var("VERSIO_UI_E2E"), Ok(v) if v == "1" || v.eq_ignore_ascii_case("true"))
}

/// Opt-in UI E2E smoke mode: stop after the imported paper is visible in Reader.
#[tauri::command]
pub fn ui_e2e_smoke_only() -> bool {
    ui_e2e_enabled()
        && matches!(
            std::env::var("VERSIO_UI_E2E_SMOKE_ONLY"),
            Ok(v) if v == "1" || v.eq_ignore_ascii_case("true")
        )
}

/// Fixture PDF path for UI E2E import (separate from service-call acceptance).
#[tauri::command]
pub fn ui_e2e_fixture_path() -> Option<String> {
    if !ui_e2e_enabled() {
        return None;
    }
    let direct = std::env::var("VERSIO_UI_E2E_DIRECT_IMPORT")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if !direct {
        return None;
    }
    std::env::var("VERSIO_UI_E2E_FIXTURE")
        .ok()
        .or_else(|| std::env::var("VERSIO_ACCEPTANCE_FIXTURE").ok())
}

fn is_safe_external_url(url: &str) -> bool {
    let trimmed = url.trim();
    (trimmed.starts_with("https://") || trimmed.starts_with("http://"))
        && !trimmed
            .chars()
            .any(|ch| ch.is_whitespace() || ch == '<' || ch == '>')
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !is_safe_external_url(&url) {
        return Err("http(s) の URL だけ開けます".into());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("このOSでは外部URLを開く操作に未対応です".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{is_safe_external_url, is_safe_paper_id, resolve_target_page, SourcePdfHighlight};

    #[test]
    fn resolve_page_prefers_highlight() {
        let highlight = SourcePdfHighlight {
            page: 4,
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 10.0,
        };
        assert_eq!(resolve_target_page(Some(2), Some(&highlight)), Some(4));
        assert_eq!(resolve_target_page(Some(2), None), Some(2));
        assert_eq!(resolve_target_page(Some(0), None), None);
        assert_eq!(resolve_target_page(None, None), None);
    }

    #[test]
    fn accepts_uuid_and_sample_ids() {
        assert!(is_safe_paper_id("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_safe_paper_id("paper-001"));
        assert!(is_safe_paper_id("paper_001"));
        assert!(is_safe_paper_id("A1"));
    }

    #[test]
    fn rejects_empty_and_dots() {
        assert!(!is_safe_paper_id(""));
        assert!(!is_safe_paper_id("."));
        assert!(!is_safe_paper_id(".."));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_safe_paper_id("../foo"));
        assert!(!is_safe_paper_id("foo/bar"));
        assert!(!is_safe_paper_id("foo\\bar"));
        assert!(!is_safe_paper_id("/tmp"));
        assert!(!is_safe_paper_id("C:\\windows"));
        assert!(!is_safe_paper_id("foo bar"));
        assert!(!is_safe_paper_id("paper.id"));
    }

    #[test]
    fn accepts_http_urls_only() {
        assert!(is_safe_external_url("https://doi.org/10.1145/123"));
        assert!(is_safe_external_url("http://example.com/paper"));
        assert!(!is_safe_external_url("javascript:alert(1)"));
        assert!(!is_safe_external_url("file:///tmp/x"));
        assert!(!is_safe_external_url("https://example.com/a b"));
    }
}
