mod ocr;
mod paper_fs;
mod source_pdf;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

/// Shared handles for the translation sidecar.
pub struct ServerState {
    pub child: Arc<Mutex<Option<Child>>>,
    pub token: Arc<Mutex<String>>,
}

fn ensure_server_token(token_slot: &Arc<Mutex<String>>) -> String {
    let mut guard = token_slot.lock().unwrap();
    if guard.is_empty() {
        *guard = random_api_token();
    }
    guard.clone()
}

/// Cryptographically strong token for localhost API auth. Not logged or persisted to disk.
fn random_api_token() -> String {
    let mut bytes = [0u8; 32];
    fill_secure_random(&mut bytes).expect("OS CSPRNG unavailable");
    let mut out = String::with_capacity(64);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn fill_secure_random(buf: &mut [u8]) -> std::io::Result<()> {
    use std::io::Read;
    std::fs::File::open("/dev/urandom")?.read_exact(buf)
}

/// translation-server ディレクトリのパスを解決する
fn resolve_server_dir(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let server_dir = manifest_dir
            .parent()
            .unwrap_or(&manifest_dir)
            .join("translation-server");
        if server_dir.exists() {
            log::info!("[dev] Using server dir: {}", server_dir.display());
            return server_dir;
        }
    }

    match app.path().resource_dir() {
        Ok(p) => {
            let server_dir = p.join("translation-server");
            log::info!("[prod] Using server dir: {}", server_dir.display());
            server_dir
        }
        Err(e) => {
            log::error!("Failed to resolve resource dir: {e}");
            PathBuf::from("translation-server")
        }
    }
}

fn find_python(server_dir: &std::path::Path) -> String {
    let bundled = server_dir.join("venv/bin/python3");
    if bundled.exists() {
        log::info!("Using bundled venv: {}", bundled.display());
        return bundled.to_string_lossy().to_string();
    }
    let dev_venv = server_dir.join(".venv/bin/python3");
    if dev_venv.exists() {
        log::info!("Using dev .venv: {}", dev_venv.display());
        return dev_venv.to_string_lossy().to_string();
    }
    log::warn!("No venv found, falling back to system python3");
    "python3".to_string()
}

fn spawn_server(app: &tauri::AppHandle, state: &ServerState) {
    let server_dir = resolve_server_dir(app);
    let python = find_python(&server_dir);
    let server_script = server_dir.join("server.py");
    let token = ensure_server_token(&state.token);

    if !server_script.exists() {
        log::error!("server.py not found at: {}", server_script.display());
        return;
    }

    log::info!("Spawning: {} {}", python, server_script.display());

    let mut command = Command::new(&python);
    command
        .arg(&server_script)
        .current_dir(&server_dir)
        .env("PYTHONPATH", server_dir.as_os_str())
        .env("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        .env("MADLAD_SERVER_SILENCE_OUTPUT", "1")
        .env("MADLAD_SERVER_HOST", "127.0.0.1")
        .env("MADLAD_SERVER_PORT", "8765")
        .env("MADLAD_SERVER_TOKEN", &token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if std::env::var("TRANSLATION_UNIT_DEBUG").unwrap_or_default() == "1" {
        let debug_log = "/tmp/paper-reader-translation-server.log";
        let _ = std::fs::remove_file(debug_log);
        command
            .env("TRANSLATION_UNIT_DEBUG", "1")
            .env("MADLAD_SERVER_DEBUG_LOG", debug_log)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());
    }

    match command.spawn() {
        Ok(child) => {
            let mut guard = state.child.lock().unwrap();
            *guard = Some(child);
            log::info!("Translation server spawned successfully.");
        }
        Err(e) => {
            log::error!("Failed to spawn translation server: {e}");
        }
    }
}

#[tauri::command]
fn restart_translation_server(app: tauri::AppHandle, state: State<'_, ServerState>) {
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            log::info!("Stopped previous translation server.");
        }
    }
    spawn_server(&app, &state);
}

#[tauri::command]
fn get_translation_server_token(state: State<'_, ServerState>) -> String {
    ensure_server_token(&state.token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_state = ServerState {
        child: Arc::new(Mutex::new(None)),
        token: Arc::new(Mutex::new(String::new())),
    };

    tauri::Builder::default()
        .manage(server_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();
            let state: State<ServerState> = app.state();
            let child = Arc::clone(&state.child);
            let token = Arc::clone(&state.token);
            tauri::async_runtime::spawn(async move {
                let proxy = ServerState { child, token };
                spawn_server(&handle, &proxy);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: State<ServerState> = window.state();
                let mut guard = state.child.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    log::info!("Translation server stopped on window close.");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            restart_translation_server,
            get_translation_server_token,
            ocr::ocr_image,
            source_pdf::save_source_pdf,
            source_pdf::copy_source_pdf,
            source_pdf::open_source_pdf,
            source_pdf::open_external_url,
            source_pdf::delete_source_pdf,
            source_pdf::source_pdf_exists,
            source_pdf::read_dropped_pdf,
            source_pdf::acceptance_fixture_path,
            source_pdf::ui_e2e_enabled,
            source_pdf::ui_e2e_fixture_path,
            paper_fs::read_app_file,
            paper_fs::write_app_file,
            paper_fs::app_file_exists,
            paper_fs::remove_app_file,
            paper_fs::rename_app_file,
            paper_fs::list_app_files,
            paper_fs::save_export_file,
            paper_fs::save_markdown_export,
            paper_fs::save_verification_export,
            paper_fs::export_app_directory,
            paper_fs::import_directory_to_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
