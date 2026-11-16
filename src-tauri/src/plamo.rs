//! PLaMo 3 Translate sidecar: pinned GGUF download + lazy `llama-server` lifecycle.
//! Design: docs/superpowers/specs/2026-11-16-plamo-translation-engine-design.md

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub const MODEL_REPO: &str = "pfnet/plamo-3-translate-2b-GGUF";
pub const MODEL_REVISION: &str = "4f672106b847200bfdc0f6af6c321cd94eba1aed";
pub const MODEL_FILE: &str = "plamo-3-translate-2b-Q4_K_M.gguf";
pub const MODEL_SIZE: u64 = 1_807_203_040;
pub const MODEL_SHA256: &str = "1ffd9073afcc70e35ccc942428aa2b73d7aa2b9ea779bf504b775369e0276c13";
pub const PORT: u16 = 8766;
const START_TIMEOUT: Duration = Duration::from_secs(60);
const LOG_FILE: &str = "plamo-server.log";
const PREV_LOG_FILE: &str = "plamo-server.prev.log";

#[derive(Default)]
pub struct PlamoState {
    child: Mutex<Option<Child>>,
    token: Mutex<String>,
    download: Mutex<()>,
}

impl PlamoState {
    pub fn stop(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("PLaMo server stopped.");
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlamoModelStatus {
    present: bool,
    downloaded_bytes: u64,
    total_bytes: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlamoServerInfo {
    base_url: String,
    token: String,
}

pub fn server_args(model: &Path, port: u16, token: &str) -> Vec<String> {
    [
        "-m", &model.to_string_lossy(), "--host", "127.0.0.1", "--port", &port.to_string(),
        "--api-key", token, "--jinja", "-c", "65536", "-np", "8", "-ngl", "99",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

pub fn verify_file(path: &Path, size: u64, sha256_hex: &str) -> Result<(), String> {
    let len = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    if len != size {
        return Err("size_mismatch".into());
    }
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let hex: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if hex == sha256_hex {
        Ok(())
    } else {
        Err("checksum_mismatch".into())
    }
}

pub fn child_alive(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(MODEL_FILE))
}

fn part_path(model: &Path) -> PathBuf {
    model.with_extension("gguf.part")
}

fn sidecar_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.parent().ok_or("no exe dir")?.join("llama-server"))
}

fn health_ok(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 16];
    matches!(stream.read(&mut head), Ok(n) if n >= 12 && &head[9..12] == b"200")
}

fn status(app: &AppHandle) -> Result<PlamoModelStatus, String> {
    let model = model_path(app)?;
    let present = model.exists();
    let downloaded_bytes = if present {
        MODEL_SIZE
    } else {
        std::fs::metadata(part_path(&model)).map(|m| m.len()).unwrap_or(0)
    };
    Ok(PlamoModelStatus { present, downloaded_bytes, total_bytes: MODEL_SIZE })
}

#[tauri::command]
pub fn plamo_model_status(app: AppHandle) -> Result<PlamoModelStatus, String> {
    status(&app)
}

fn download_blocking(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<PlamoState>();
    let _guard = state.download.lock().unwrap();
    let model = model_path(app)?;
    if model.exists() {
        return Ok(());
    }
    let part = part_path(&model);
    let url = format!("https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{MODEL_FILE}");
    let mut child = Command::new("/usr/bin/curl")
        .args(["-fsSL", "-C", "-", "--retry", "5", "--retry-all-errors", "-o"])
        .arg(&part)
        .arg(&url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let exit = loop {
        if let Some(code) = child.try_wait().map_err(|e| e.to_string())? {
            break code;
        }
        if let Ok(s) = status(app) {
            let _ = app.emit("plamo-model-progress", s);
        }
        std::thread::sleep(Duration::from_millis(500));
    };
    if !exit.success() {
        return Err("download_failed".into());
    }
    if let Err(e) = verify_file(&part, MODEL_SIZE, MODEL_SHA256) {
        if e == "checksum_mismatch" {
            let _ = std::fs::remove_file(&part);
        }
        return Err(e);
    }
    std::fs::rename(&part, &model).map_err(|e| e.to_string())?;
    let _ = app.emit("plamo-model-progress", status(app)?);
    Ok(())
}

#[tauri::command]
pub async fn download_plamo_model(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || download_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn open_log(app: &AppHandle) -> Option<std::fs::File> {
    let dir = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let log = dir.join(LOG_FILE);
    if log.exists() {
        let _ = std::fs::rename(&log, dir.join(PREV_LOG_FILE));
    }
    std::fs::File::create(log).ok()
}

fn ensure_blocking(app: &AppHandle) -> Result<PlamoServerInfo, String> {
    let model = model_path(app)?;
    if !model.exists() {
        return Err("model_not_downloaded".into());
    }
    let state = app.state::<PlamoState>();
    let mut child_slot = state.child.lock().unwrap();
    let mut token = state.token.lock().unwrap();
    let base_url = format!("http://127.0.0.1:{PORT}");
    if let Some(child) = child_slot.as_mut() {
        if child_alive(child) {
            return Ok(PlamoServerInfo { base_url, token: token.clone() });
        }
        log::warn!("PLaMo server exited; respawning.");
        *child_slot = None;
    }
    *token = crate::random_api_token();
    let mut command = Command::new(sidecar_path()?);
    command.args(server_args(&model, PORT, &token)).stdin(Stdio::null());
    match open_log(app).and_then(|f| Some((f.try_clone().ok()?, f))) {
        Some((out, err)) => command.stdout(out).stderr(err),
        None => command.stdout(Stdio::null()).stderr(Stdio::null()),
    };
    let mut child = command.spawn().map_err(|e| format!("spawn_failed: {e}"))?;
    let started = Instant::now();
    while !health_ok(PORT) {
        if !child_alive(&mut child) || started.elapsed() > START_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err("server_start_timeout".into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    log::info!("PLaMo server ready on port {PORT}.");
    *child_slot = Some(child);
    Ok(PlamoServerInfo { base_url, token: token.clone() })
}

#[tauri::command]
pub async fn ensure_plamo_server(app: AppHandle) -> Result<PlamoServerInfo, String> {
    tauri::async_runtime::spawn_blocking(move || ensure_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_args_match_spec() {
        let args = server_args(Path::new("/m/x.gguf"), 8766, "tok");
        assert_eq!(
            args,
            [
                "-m", "/m/x.gguf", "--host", "127.0.0.1", "--port", "8766", "--api-key", "tok", "--jinja",
                "-c", "65536", "-np", "8", "-ngl", "99"
            ]
        );
    }

    fn temp_with(bytes: &[u8], name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("versio-plamo-test-{}-{name}", std::process::id()));
        std::fs::write(&p, bytes).unwrap();
        p
    }

    // sha256("abc") and sha256("abd")
    const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const ABD: &str = "a52d159f262b2c6ddb724a61840befc36eb30c88877a4030b65cbe86298449c9";

    #[test]
    fn verify_file_rejects_wrong_hash() {
        let p = temp_with(b"abc", "hash");
        assert_eq!(verify_file(&p, 3, ABD), Err("checksum_mismatch".to_string()));
    }

    #[test]
    fn verify_file_rejects_wrong_size() {
        let p = temp_with(b"abc", "size");
        assert_eq!(verify_file(&p, 4, ABC), Err("size_mismatch".to_string()));
    }

    #[test]
    fn verify_file_accepts_match() {
        let p = temp_with(b"abc", "ok");
        assert_eq!(verify_file(&p, 3, ABC), Ok(()));
    }

    #[test]
    fn dead_child_is_respawned() {
        let mut child = Command::new("/bin/sleep").arg("0").spawn().unwrap();
        child.wait().unwrap();
        assert!(!child_alive(&mut child));
    }
}
