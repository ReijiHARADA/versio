mod app_info;
mod bibliography;
#[cfg(target_os = "macos")]
mod legacy_data;
#[cfg(target_os = "macos")]
mod macos_chrome;
mod menu;
mod ocr;
mod opened_files;
mod paper_fs;
mod plamo;
mod search_index;
mod source_pdf;
mod updater;

use tauri::Manager;

/// Cryptographically strong token for the localhost PLaMo API. Not logged or persisted.
fn random_api_token() -> String {
    let mut bytes = [0u8; 32];
    fill_secure_random(&mut bytes).expect("OS CSPRNG unavailable");
    let mut out = String::with_capacity(64);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn fill_secure_random(buf: &mut [u8]) -> std::io::Result<()> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom")?.read_exact(buf)
}

/// Sync macOS title-bar fill with sidebar (`--color-bg-secondary`).
/// `theme` is `"light"` or `"dark"` (resolved; not `"system"`).
#[tauri::command]
fn sync_window_chrome_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let dark = theme == "dark";
    #[cfg(target_os = "macos")]
    {
        macos_chrome::apply_to_main_window(&app, dark)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, dark);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    legacy_data::migrate();
    tauri::Builder::default()
        .manage(plamo::PlamoState::default())
        .manage(opened_files::OpenedPdfQueue::default())
        .manage(search_index::SearchIndexState::default())
        // Restore window size/position only; other flags (visibility,
        // decorations) would fight the macOS chrome setup.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .menu(menu::build)
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .setup(|app| {
            // Release keeps warnings and errors in the app log dir so a
            // distributed `.app` failure can be diagnosed after the fact.
            let level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            app.handle()
                .plugin(tauri_plugin_log::Builder::default().level(level).build())?;

            #[cfg(target_os = "macos")]
            {
                // Light default; frontend syncs after theme resolve.
                if let Err(err) = macos_chrome::apply_to_main_window(app.handle(), false) {
                    log::warn!("macOS chrome init failed: {err}");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                window.state::<plamo::PlamoState>().stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            updater::check_for_update,
            app_info::app_storage_usage,
            app_info::reveal_app_data_dir,
            app_info::reveal_translation_log,
            updater::install_update,
            plamo::plamo_model_status,
            plamo::download_plamo_model,
            plamo::ensure_plamo_server,
            plamo::plamo_server_if_running,
            sync_window_chrome_theme,
            ocr::ocr_image,
            bibliography::fetch_bibliographic_record,
            bibliography::download_open_access_pdf,
            bibliography::search_bibliographic_records,
            source_pdf::save_source_pdf,
            source_pdf::copy_source_pdf,
            source_pdf::open_source_pdf,
            source_pdf::open_external_url,
            source_pdf::delete_source_pdf,
            source_pdf::source_pdf_exists,
            source_pdf::read_dropped_pdf,
            opened_files::take_opened_pdfs,
            source_pdf::acceptance_fixture_path,
            source_pdf::ui_e2e_enabled,
            source_pdf::ui_e2e_smoke_only,
            source_pdf::ui_e2e_fixture_path,
            search_index::search_index_put,
            search_index::search_index_put_many,
            search_index::search_index_set_meta,
            search_index::search_index_delete,
            search_index::search_index_ids,
            search_index::search_index_search,
            paper_fs::read_app_file,
            paper_fs::write_app_file,
            paper_fs::app_file_exists,
            paper_fs::remove_app_file,
            paper_fs::rename_app_file,
            paper_fs::list_app_files,
            paper_fs::save_export_file,
            paper_fs::save_markdown_export,
            paper_fs::save_verification_export,
            paper_fs::choose_epub_sync_folder,
            paper_fs::sync_epub_file,
            paper_fs::export_app_directory,
            paper_fs::import_directory_to_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Finder "Open With" / `open -a Versio file.pdf` (also on cold launch).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                opened_files::enqueue_opened_urls(app, urls);
            }
            let _ = (app, event);
        });
}
