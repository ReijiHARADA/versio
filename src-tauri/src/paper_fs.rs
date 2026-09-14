use serde::Deserialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

fn is_safe_relative(relative: &str) -> bool {
    if relative.is_empty() || relative.starts_with('/') || relative.contains('\\') {
        return false;
    }
    Path::new(relative)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn resolve(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    if !is_safe_relative(relative) {
        return Err("無効なパスです".into());
    }
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = root.join(relative);
    if !path.starts_with(&root) {
        return Err("無効なパスです".into());
    }
    Ok(path)
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_app_file(app: AppHandle, relative_path: String) -> Result<Option<Vec<u8>>, String> {
    let path = resolve(&app, &relative_path)?;
    if !path.is_file() {
        return Ok(None);
    }
    fs::read(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_app_file(app: AppHandle, relative_path: String, data: Vec<u8>) -> Result<(), String> {
    let path = resolve(&app, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_file_exists(app: AppHandle, relative_path: String) -> Result<bool, String> {
    Ok(resolve(&app, &relative_path)?.exists())
}

#[tauri::command]
pub fn remove_app_file(app: AppHandle, relative_path: String) -> Result<(), String> {
    let path = resolve(&app, &relative_path)?;
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_app_file(app: AppHandle, from: String, to: String) -> Result<(), String> {
    let source = resolve(&app, &from)?;
    let dest = resolve(&app, &to)?;
    if !source.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &dest).map_err(|e| e.to_string())
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("-128") || err.to_lowercase().contains("user canceled") {
            return Ok(String::new());
        }
        return Err(err.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn choose_save_path(default_name: &str) -> Result<Option<PathBuf>, String> {
    let name = escape_applescript(default_name);
    let path = run_osascript(&format!(
        r#"try
set thePath to POSIX path of (choose file name with prompt "書き出し先を選択" default name "{name}")
return thePath
on error number -128
return ""
end try"#
    ))?;
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(PathBuf::from(path)))
}

fn choose_directory_with_prompt(prompt: &str) -> Result<Option<PathBuf>, String> {
    let prompt = escape_applescript(prompt);
    let path = run_osascript(&format!(
        r#"try
set thePath to POSIX path of (choose folder with prompt "{prompt}")
return thePath
on error number -128
return ""
end try"#
    ))?;
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(PathBuf::from(path)))
}

fn choose_directory() -> Result<Option<PathBuf>, String> {
    choose_directory_with_prompt("保存先フォルダを選択")
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(from).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src = entry.path();
        let dest = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir_recursive(&src, &dest)?;
        } else if src.is_file() {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Export an app-data relative directory to a user-chosen folder (Library Backup).
#[tauri::command]
pub fn export_app_directory(
    app: AppHandle,
    relative_path: String,
    dialog_title: String,
    default_name: String,
) -> Result<Option<String>, String> {
    if default_name.is_empty()
        || default_name.contains('/')
        || default_name.contains('\\')
        || default_name.contains("..")
    {
        return Err("無効なフォルダ名です".into());
    }
    let source = resolve(&app, &relative_path)?;
    if !source.is_dir() {
        return Err("エクスポートするバックアップがありません".into());
    }
    let base = match choose_directory_with_prompt(&dialog_title)? {
        Some(p) => p,
        None => return Ok(None),
    };
    let dest = base.join(&default_name);
    if dest.exists() {
        return Err("同じ名前のフォルダが既に存在します".into());
    }
    copy_dir_recursive(&source, &dest)?;
    Ok(Some(dest.to_string_lossy().to_string()))
}

/// Copy a user-chosen backup folder into an app-data relative staging path.
#[tauri::command]
pub fn import_directory_to_app(
    app: AppHandle,
    relative_path: String,
    dialog_title: String,
) -> Result<Option<String>, String> {
    let dest = resolve(&app, &relative_path)?;
    let source = match choose_directory_with_prompt(&dialog_title)? {
        Some(p) => p,
        None => return Ok(None),
    };
    if !source.is_dir() {
        return Err("選択した場所はフォルダではありません".into());
    }
    // Require backup.json at the root of the selection
    if !source.join("backup.json").is_file() {
        return Err("backup.json が見つかりません。Paper Reader Backup フォルダを選んでください".into());
    }
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    copy_dir_recursive(&source, &dest)?;
    Ok(Some(relative_path))
}

fn ensure_extension(path: PathBuf, ext: &str) -> PathBuf {
    let want = ext.trim_start_matches('.');
    match path.extension().and_then(|e| e.to_str()) {
        Some(existing) if existing.eq_ignore_ascii_case(want) => path,
        _ => path.with_extension(want),
    }
}

fn write_bytes_at(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, data).map_err(|e| e.to_string())
}

fn is_safe_asset_rel(path: &str) -> bool {
    let normalized = path.replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') || normalized.contains("..") {
        return false;
    }
    Path::new(&normalized)
        .components()
        .all(|c| matches!(c, Component::Normal(_)))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAssetInput {
    pub relative_path: String,
    pub data: Vec<u8>,
}

/// Dialog → write a single file. Frontend never supplies an absolute path.
#[tauri::command]
pub fn save_export_file(default_name: String, data: Vec<u8>) -> Result<Option<String>, String> {
    let picked = match choose_save_path(&default_name)? {
        Some(p) => p,
        None => return Ok(None),
    };
    let ext = Path::new(&default_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let dest = if ext.is_empty() {
        picked
    } else {
        ensure_extension(picked, ext)
    };
    write_bytes_at(&dest, &data)?;
    Ok(Some(dest.to_string_lossy().to_string()))
}

/// Dialog for a Markdown file, then write markdown + sibling asset files.
#[tauri::command]
pub fn save_markdown_export(
    default_name: String,
    markdown: Vec<u8>,
    assets: Vec<ExportAssetInput>,
) -> Result<Option<String>, String> {
    let picked = match choose_save_path(&default_name)? {
        Some(p) => p,
        None => return Ok(None),
    };
    let dest = ensure_extension(picked, "md");
    write_bytes_at(&dest, &markdown)?;
    let parent = dest
        .parent()
        .ok_or_else(|| "保存先ディレクトリを解決できません".to_string())?;
    for asset in assets {
        if !is_safe_asset_rel(&asset.relative_path) {
            return Err(format!("無効なアセットパスです: {}", asset.relative_path));
        }
        let rel = asset.relative_path.replace('\\', "/");
        let out = parent.join(rel);
        if !out.starts_with(parent) {
            return Err("無効なアセットパスです".into());
        }
        write_bytes_at(&out, &asset.data)?;
    }
    Ok(Some(dest.to_string_lossy().to_string()))
}

/// Dialog for a folder, then write a verification package under `folder_name`.
#[tauri::command]
pub fn save_verification_export(
    app: AppHandle,
    paper_id: String,
    folder_name: String,
    markdown: Vec<u8>,
    assets: Vec<ExportAssetInput>,
    include_source_pdf: bool,
    source_pdf: Option<Vec<u8>>,
) -> Result<Option<String>, String> {
    if folder_name.is_empty()
        || folder_name.contains('/')
        || folder_name.contains('\\')
        || folder_name.contains("..")
    {
        return Err("無効なフォルダ名です".into());
    }
    if !crate::source_pdf::is_safe_paper_id(&paper_id) {
        return Err("無効な論文IDです".into());
    }
    let base = match choose_directory()? {
        Some(p) => p,
        None => return Ok(None),
    };
    let dest_root = base.join(&folder_name);
    fs::create_dir_all(&dest_root).map_err(|e| e.to_string())?;
    write_bytes_at(&dest_root.join("translated.md"), &markdown)?;

    if include_source_pdf {
        let dest_pdf = dest_root.join("source.pdf");
        let src = resolve(&app, &format!("papers/{paper_id}/source.pdf"));
        if let Ok(src) = src {
            if src.is_file() {
                fs::copy(&src, &dest_pdf).map_err(|e| e.to_string())?;
            } else if let Some(bytes) = source_pdf.as_ref() {
                write_bytes_at(&dest_pdf, bytes)?;
            }
        } else if let Some(bytes) = source_pdf.as_ref() {
            write_bytes_at(&dest_pdf, bytes)?;
        }
    }

    for asset in assets {
        if !is_safe_asset_rel(&asset.relative_path) {
            return Err(format!("無効なアセットパスです: {}", asset.relative_path));
        }
        let rel = asset.relative_path.replace('\\', "/");
        let out = dest_root.join(&rel);
        if !out.starts_with(&dest_root) {
            return Err("無効なアセットパスです".into());
        }
        // Prefer package file when present; otherwise use provided bytes.
        let package_rel = if rel.starts_with("assets/") {
            format!("papers/{paper_id}/{rel}")
        } else {
            format!("papers/{paper_id}/assets/{rel}")
        };
        if let Ok(src) = resolve(&app, &package_rel) {
            if src.is_file() {
                if let Some(parent) = out.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::copy(&src, &out).map_err(|e| e.to_string())?;
                continue;
            }
        }
        write_bytes_at(&out, &asset.data)?;
    }

    Ok(Some(dest_root.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn list_app_files(app: AppHandle, prefix: String) -> Result<Vec<String>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = resolve(&app, &prefix)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    if path.is_file() {
        return Ok(vec![prefix]);
    }
    let mut files = vec![];
    collect_files(&root, &path, &mut files)?;
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::{ensure_extension, is_safe_asset_rel, is_safe_relative};
    use std::path::PathBuf;

    #[test]
    fn accepts_package_paths() {
        assert!(is_safe_relative("library.sqlite"));
        assert!(is_safe_relative("papers/abc/original.md"));
        assert!(is_safe_relative("papers/abc.tmp/paper.json"));
    }

    #[test]
    fn rejects_traversal() {
        assert!(!is_safe_relative("../secret"));
        assert!(!is_safe_relative("/tmp/x"));
        assert!(!is_safe_relative("papers/../x"));
    }

    #[test]
    fn asset_rel_rejects_traversal() {
        assert!(is_safe_asset_rel("assets/fig-1.png"));
        assert!(!is_safe_asset_rel("../etc/passwd"));
        assert!(!is_safe_asset_rel("/tmp/x"));
    }

    #[test]
    fn ensures_extension() {
        let p = ensure_extension(PathBuf::from("/tmp/out"), "md");
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("md"));
        let p2 = ensure_extension(PathBuf::from("/tmp/out.MD"), "md");
        assert_eq!(p2, PathBuf::from("/tmp/out.MD"));
    }
}
