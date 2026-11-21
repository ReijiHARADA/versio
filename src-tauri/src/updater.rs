//! In-app updates from GitHub Releases `latest.json` (signed with the
//! updater key; see docs/MACOS_RELEASE.md). The frontend asks, then installs.

use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::UpdaterExt;

/// Newer version string, or `None` when already up to date.
#[tauri::command]
pub async fn check_for_update<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| u.version))
}

/// Download, verify the signature, replace the `.app`, then relaunch.
#[tauri::command]
pub async fn install_update<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| {
            log::error!("update install failed: {e}");
            e.to_string()
        })?;
    app.restart()
}
