//! PDFs handed to Versio by macOS ("Open With", `open -a Versio a.pdf`).
//!
//! `RunEvent::Opened` can arrive before the webview is listening (cold launch),
//! so paths are queued here and the frontend drains them with
//! `take_opened_pdfs` on mount and on every `opened-pdfs` event.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Url};

pub const OPENED_PDFS_EVENT: &str = "opened-pdfs";

#[derive(Default)]
pub struct OpenedPdfQueue(Mutex<Vec<String>>);

/// Local `file://` URLs with a `.pdf` extension, as filesystem paths.
pub fn pdf_paths_from_urls(urls: &[Url]) -> Vec<String> {
    urls.iter()
        .filter(|url| url.scheme() == "file")
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| {
            path.extension()
                .map(|ext| ext.eq_ignore_ascii_case("pdf"))
                .unwrap_or(false)
        })
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

pub fn enqueue_opened_urls(app: &AppHandle, urls: &[Url]) {
    let paths = pdf_paths_from_urls(urls);
    if paths.is_empty() {
        return;
    }
    if let Some(queue) = app.try_state::<OpenedPdfQueue>() {
        if let Ok(mut pending) = queue.0.lock() {
            pending.extend(paths);
        }
    }
    let _ = app.emit(OPENED_PDFS_EVENT, ());
}

#[tauri::command]
pub fn take_opened_pdfs(queue: State<'_, OpenedPdfQueue>) -> Vec<String> {
    queue
        .0
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_local_pdf_files() {
        let urls = [
            Url::parse("file:///Users/me/Papers/A%20study.pdf").unwrap(),
            Url::parse("file:///Users/me/Papers/B.PDF").unwrap(),
            Url::parse("file:///Users/me/notes.txt").unwrap(),
            Url::parse("https://example.org/c.pdf").unwrap(),
        ];
        assert_eq!(
            pdf_paths_from_urls(&urls),
            vec!["/Users/me/Papers/A study.pdf", "/Users/me/Papers/B.PDF"]
        );
    }
}
