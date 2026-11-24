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
/// Preferred port; a free port is used when it is taken (stale sidecar, other program).
pub const PORT: u16 = 8766;
const START_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const LOG_FILE: &str = "plamo-server.log";
const PREV_LOG_FILE: &str = "plamo-server.prev.log";

#[derive(Default)]
pub struct PlamoState {
    /// Running (or starting) server: child, port, token. Locked only briefly so `stop()` never waits.
    server: Mutex<Option<(Child, u16, String)>>,
    /// Serializes server starts; held during the health wait instead of `server`.
    starting: Mutex<()>,
    /// Serializes downloads.
    download: Mutex<()>,
    /// In-flight curl, killed by `stop()` so it cannot keep writing `.part` after exit.
    download_child: Mutex<Option<Child>>,
}

fn kill_child(slot: &Mutex<Option<Child>>) {
    if let Some(mut child) = slot.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

impl PlamoState {
    pub fn stop(&self) {
        if let Some((mut child, _, _)) =
            self.server.lock().unwrap_or_else(|e| e.into_inner()).take()
        {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("PLaMo server stopped.");
        }
        kill_child(&self.download_child);
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
        "-m",
        &model.to_string_lossy(),
        "--host",
        "127.0.0.1",
        "--port",
        &port.to_string(),
        "--api-key",
        token,
        "--jinja",
        "-c",
        "65536",
        "-np",
        "8",
        "-ngl",
        "99",
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
    let hex: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
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
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
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

/// Status code of `GET <path>` on 127.0.0.1:<port>, optionally with a bearer token.
pub fn http_status(port: u16, path: &str, token: Option<&str>) -> Option<u16> {
    let mut stream =
        TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(500))
            .ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let auth = token
        .map(|t| format!("Authorization: Bearer {t}\r\n"))
        .unwrap_or_default();
    let req =
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{auth}Connection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut head = [0u8; 16];
    let n = stream.read(&mut head).ok()?;
    std::str::from_utf8(head.get(9..12.min(n))?)
        .ok()?
        .parse()
        .ok()
}

/// Our server answers authenticated requests; a stale sidecar or another program does not.
pub fn server_is_ours(port: u16, token: &str) -> bool {
    http_status(port, "/v1/models", Some(token)) == Some(200)
}

pub fn port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn pick_port() -> Result<u16, String> {
    if port_free(PORT) {
        return Ok(PORT);
    }
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

/// Kill a process left over from a crashed/force-quit run, if the pid file names one with
/// the expected command name. Removes the pid file.
pub fn kill_orphan(pid_file: &Path, expected_comm: &str) {
    let Some(pid) = std::fs::read_to_string(pid_file)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
    else {
        return;
    };
    let _ = std::fs::remove_file(pid_file);
    let comm = Command::new("/bin/ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output();
    if let Ok(out) = comm {
        if String::from_utf8_lossy(&out.stdout)
            .trim()
            .ends_with(expected_comm)
        {
            let _ = Command::new("/bin/kill")
                .args(["-9", &pid.to_string()])
                .status();
            log::warn!("Killed orphaned {expected_comm} (pid {pid}).");
        }
    }
}

/// Kill `child` if `parent` dies first. SIGTERM / crash / force-quit skip the window-close
/// hook, and macOS has no parent-death signal, so a tiny shell watcher covers that case.
/// The watcher exits on its own when the child exits.
pub fn spawn_watchdog(parent: u32, child: u32) {
    let script =
        "while kill -0 \"$0\" 2>/dev/null && kill -0 \"$1\" 2>/dev/null; do sleep 2; done; \
                  kill -0 \"$0\" 2>/dev/null || kill -9 \"$1\" 2>/dev/null";
    let _ = Command::new("/bin/sh")
        .args(["-c", script, &parent.to_string(), &child.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

fn pid_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(model_path(app)?.with_file_name(name))
}

fn status(app: &AppHandle) -> Result<PlamoModelStatus, String> {
    let model = model_path(app)?;
    let present = model.exists();
    let downloaded_bytes = if present {
        MODEL_SIZE
    } else {
        std::fs::metadata(part_path(&model))
            .map(|m| m.len())
            .unwrap_or(0)
    };
    Ok(PlamoModelStatus {
        present,
        downloaded_bytes,
        total_bytes: MODEL_SIZE,
    })
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
    // A curl from a force-quit run would interleave writes into the same `.part`.
    let curl_pid = pid_file(app, "download.pid")?;
    kill_orphan(&curl_pid, "curl");
    if std::fs::metadata(&part)
        .map(|m| m.len() > MODEL_SIZE)
        .unwrap_or(false)
    {
        let _ = std::fs::remove_file(&part);
    }
    let url = format!("https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{MODEL_FILE}");
    let child = Command::new("/usr/bin/curl")
        .args([
            "-fsSL",
            "-C",
            "-",
            "--retry",
            "5",
            "--retry-all-errors",
            "-o",
        ])
        .arg(&part)
        .arg(&url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::write(&curl_pid, child.id().to_string());
    spawn_watchdog(std::process::id(), child.id());
    *state.download_child.lock().unwrap() = Some(child);
    let exit = loop {
        let polled = {
            let mut slot = state.download_child.lock().unwrap();
            match slot.as_mut() {
                // `stop()` took and killed it: the app is closing.
                None => None,
                Some(c) => Some(c.try_wait().map_err(|e| e.to_string())?),
            }
        };
        match polled {
            None => {
                let _ = std::fs::remove_file(&curl_pid);
                return Err("download_cancelled".into());
            }
            Some(Some(code)) => {
                state.download_child.lock().unwrap().take();
                let _ = std::fs::remove_file(&curl_pid);
                break code;
            }
            Some(None) => {}
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
    let _starting = state.starting.lock().unwrap();
    {
        let mut slot = state.server.lock().unwrap();
        if let Some((child, port, token)) = slot.as_mut() {
            if child_alive(child) {
                return Ok(PlamoServerInfo {
                    base_url: format!("http://127.0.0.1:{port}"),
                    token: token.clone(),
                });
            }
            log::warn!("PLaMo server exited; respawning.");
            *slot = None;
        }
    }
    let server_pid = pid_file(app, "plamo-server.pid")?;
    kill_orphan(&server_pid, "llama-server");
    let port = pick_port()?;
    let token = crate::random_api_token();
    let mut command = Command::new(sidecar_path()?);
    command
        .args(server_args(&model, port, &token))
        .stdin(Stdio::null());
    match open_log(app).and_then(|f| Some((f.try_clone().ok()?, f))) {
        Some((out, err)) => command.stdout(out).stderr(err),
        None => command.stdout(Stdio::null()).stderr(Stdio::null()),
    };
    let child = command.spawn().map_err(|e| format!("spawn_failed: {e}"))?;
    let _ = std::fs::write(&server_pid, child.id().to_string());
    spawn_watchdog(std::process::id(), child.id());
    // Publish immediately so `stop()` can kill a still-starting server without waiting.
    *state.server.lock().unwrap() = Some((child, port, token.clone()));
    let started = Instant::now();
    loop {
        let alive = match state.server.lock().unwrap().as_mut() {
            Some((child, _, _)) => child_alive(child),
            None => return Err("stopped".into()),
        };
        if !alive {
            state.server.lock().unwrap().take();
            return Err("server_exited".into());
        }
        if server_is_ours(port, &token) {
            break;
        }
        if started.elapsed() > START_TIMEOUT {
            if let Some((mut child, _, _)) = state.server.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            return Err("server_start_timeout".into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    log::info!("PLaMo server ready on port {port}.");
    Ok(PlamoServerInfo {
        base_url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

/// Server info only when the sidecar is already running; never starts it. Search uses this to
/// translate query terms without paying the model load for a search.
#[tauri::command]
pub fn plamo_server_if_running(app: AppHandle) -> Option<PlamoServerInfo> {
    let state = app.state::<PlamoState>();
    let mut slot = state.server.lock().unwrap();
    let (child, port, token) = slot.as_mut()?;
    if !child_alive(child) {
        return None;
    }
    Some(PlamoServerInfo {
        base_url: format!("http://127.0.0.1:{port}"),
        token: token.clone(),
    })
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
                "-m",
                "/m/x.gguf",
                "--host",
                "127.0.0.1",
                "--port",
                "8766",
                "--api-key",
                "tok",
                "--jinja",
                "-c",
                "65536",
                "-np",
                "8",
                "-ngl",
                "99"
            ]
        );
    }

    fn temp_with(bytes: &[u8], name: &str) -> PathBuf {
        let p =
            std::env::temp_dir().join(format!("versio-plamo-test-{}-{name}", std::process::id()));
        std::fs::write(&p, bytes).unwrap();
        p
    }

    // sha256("abc") and sha256("abd")
    const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const ABD: &str = "a52d159f262b2c6ddb724a61840befc36eb30c88877a4030b65cbe86298449c9";

    #[test]
    fn verify_file_rejects_wrong_hash() {
        let p = temp_with(b"abc", "hash");
        assert_eq!(
            verify_file(&p, 3, ABD),
            Err("checksum_mismatch".to_string())
        );
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

    fn serve_once(status: &'static str) -> u16 {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut s, _)) = listener.accept() {
                let mut buf = [0u8; 512];
                let _ = s.read(&mut buf);
                let _ = s.write_all(
                    format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\n\r\n").as_bytes(),
                );
            }
        });
        port
    }

    #[test]
    fn foreign_server_on_port_is_not_ours() {
        // A stale sidecar with another token answers /health 200 but /v1/models 401.
        assert!(!server_is_ours(serve_once("401 Unauthorized"), "tok"));
        assert!(server_is_ours(serve_once("200 OK"), "tok"));
    }

    #[test]
    fn busy_port_is_detected() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        assert!(!port_free(listener.local_addr().unwrap().port()));
    }

    #[test]
    fn orphan_is_killed_only_when_command_matches() {
        let mut keep = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let mut orphan = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let f = temp_with(keep.id().to_string().as_bytes(), "pid-keep");
        kill_orphan(&f, "llama-server");
        assert!(child_alive(&mut keep));
        let g = temp_with(orphan.id().to_string().as_bytes(), "pid-orphan");
        kill_orphan(&g, "sleep");
        std::thread::sleep(Duration::from_millis(200));
        assert!(!child_alive(&mut orphan));
        assert!(!g.exists());
        let _ = keep.kill();
    }

    #[test]
    fn stop_kills_download_and_does_not_wait_for_a_start() {
        let state = PlamoState::default();
        let _starting = state.starting.lock().unwrap(); // a start is in its health wait
        *state.download_child.lock().unwrap() =
            Some(Command::new("/bin/sleep").arg("30").spawn().unwrap());
        *state.server.lock().unwrap() = Some((
            Command::new("/bin/sleep").arg("30").spawn().unwrap(),
            1,
            "t".into(),
        ));
        let t0 = Instant::now();
        state.stop();
        assert!(t0.elapsed() < Duration::from_secs(1));
        assert!(state.download_child.lock().unwrap().is_none());
        assert!(state.server.lock().unwrap().is_none());
    }

    #[test]
    fn watchdog_kills_child_when_parent_dies() {
        let mut parent = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        let mut child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        spawn_watchdog(parent.id(), child.id());
        parent.kill().unwrap();
        parent.wait().unwrap();
        std::thread::sleep(Duration::from_secs(3));
        assert!(!child_alive(&mut child));
    }

    #[test]
    fn dead_child_is_respawned() {
        let mut child = Command::new("/bin/sleep").arg("0").spawn().unwrap();
        child.wait().unwrap();
        assert!(!child_alive(&mut child));
    }
}
