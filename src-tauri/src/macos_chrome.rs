//! macOS title bar: transparent chrome whose fill matches the app sidebar
//! (`--color-bg-secondary`: light `#f8f9fa`, dark `#252526`).

use tauri::{AppHandle, Manager, TitleBarStyle, WebviewWindow};

/// Light sidebar `--color-bg-secondary` (#f8f9fa).
const LIGHT_R: f64 = 248.0 / 255.0;
const LIGHT_G: f64 = 249.0 / 255.0;
const LIGHT_B: f64 = 250.0 / 255.0;

/// Dark sidebar `--color-bg-secondary` (#252526).
const DARK_R: f64 = 37.0 / 255.0;
const DARK_G: f64 = 37.0 / 255.0;
const DARK_B: f64 = 38.0 / 255.0;

pub fn apply_sidebar_matched_chrome(window: &WebviewWindow, dark: bool) -> Result<(), String> {
    window
        .set_title_bar_style(TitleBarStyle::Transparent)
        .map_err(|e| e.to_string())?;
    set_window_background(window, dark)
}

fn set_window_background(window: &WebviewWindow, dark: bool) -> Result<(), String> {
    use objc2_app_kit::{NSColor, NSWindow};

    let ptr = window.ns_window().map_err(|e| e.to_string())?;
    if ptr.is_null() {
        return Ok(());
    }
    // Safety: pointer from Tauri's ns_window() is a valid NSWindow for this process.
    let ns_window = unsafe { &*(ptr as *const NSWindow) };
    let (r, g, b) = if dark {
        (DARK_R, DARK_G, DARK_B)
    } else {
        (LIGHT_R, LIGHT_G, LIGHT_B)
    };
    let bg = NSColor::colorWithSRGBRed_green_blue_alpha(r, g, b, 1.0);
    ns_window.setBackgroundColor(Some(&bg));
    Ok(())
}

pub fn apply_to_main_window(app: &AppHandle, dark: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    apply_sidebar_matched_chrome(&window, dark)
}
