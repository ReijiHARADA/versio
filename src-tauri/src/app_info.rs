//! Settings → このアプリについて / 保存場所: reveal folders in Finder and report disk usage.
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::paper_fs::e2e_app_data_root;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub path: String,
    pub papers_bytes: u64,
    pub models_bytes: u64,
    pub total_bytes: u64,
}

fn dir_size(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return 0;
    };
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries.flatten().map(|entry| dir_size(&entry.path())).sum()
}

fn open_in_finder(path: &Path, reveal: bool) -> Result<(), String> {
    let mut cmd = std::process::Command::new("open");
    if reveal {
        cmd.arg("-R");
    }
    cmd.arg(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn app_storage_usage(app: AppHandle) -> Result<StorageUsage, String> {
    let root = e2e_app_data_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || StorageUsage {
        path: root.to_string_lossy().into_owned(),
        papers_bytes: dir_size(&root.join("papers")),
        models_bytes: dir_size(&root.join("models")),
        total_bytes: dir_size(&root),
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_app_data_dir(app: AppHandle) -> Result<(), String> {
    let root = e2e_app_data_root(&app)?;
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    open_in_finder(&root, false)
}

/// Selects the translation server log in Finder (or opens the log folder if none yet).
#[tauri::command]
pub fn reveal_translation_log(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let log = dir.join(crate::plamo::LOG_FILE);
    if log.exists() {
        return open_in_finder(&log, true);
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_in_finder(&dir, false)
}
