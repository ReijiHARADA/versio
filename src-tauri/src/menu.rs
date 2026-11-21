//! Japanese macOS menu bar. Custom items emit `menu-action` with their id;
//! the frontend (`AppShell`) performs the action.

use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub const ACTIONS: [&str; 4] = ["settings", "add-paper", "new-folder", "toggle-sidebar"];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str, accel: &str| {
        MenuItemBuilder::with_id(id, text)
            .accelerator(accel)
            .build(app)
    };

    let app_menu = SubmenuBuilder::new(app, "Versio")
        .about_with_text("Versio について", Some(AboutMetadata::default()))
        .separator()
        .item(&item("settings", "設定…", "CmdOrCtrl+,")?)
        .separator()
        .services_with_text("サービス")
        .separator()
        .hide_with_text("Versio を隠す")
        .hide_others_with_text("ほかを隠す")
        .show_all_with_text("すべてを表示")
        .separator()
        .quit_with_text("Versio を終了")
        .build()?;

    let file = SubmenuBuilder::new(app, "ファイル")
        .item(&item("add-paper", "論文を追加…", "CmdOrCtrl+O")?)
        .item(&item("new-folder", "新規フォルダ", "CmdOrCtrl+Shift+N")?)
        .separator()
        .close_window_with_text("ウインドウを閉じる")
        .build()?;

    let edit = SubmenuBuilder::new(app, "編集")
        .undo_with_text("取り消す")
        .redo_with_text("やり直す")
        .separator()
        .cut_with_text("カット")
        .copy_with_text("コピー")
        .paste_with_text("ペースト")
        .select_all_with_text("すべてを選択")
        .build()?;

    let view = SubmenuBuilder::new(app, "表示")
        .item(&item(
            "toggle-sidebar",
            "サイドバーを表示／非表示",
            "CmdOrCtrl+Ctrl+S",
        )?)
        .separator()
        .fullscreen_with_text("フルスクリーンにする")
        .build()?;

    let window = SubmenuBuilder::new(app, "ウインドウ")
        .minimize_with_text("しまう")
        .maximize_with_text("拡大／縮小")
        .separator()
        .bring_all_to_front_with_text("すべてを手前に移動")
        .build()?;
    #[cfg(target_os = "macos")]
    window.set_as_windows_menu_for_nsapp()?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if ACTIONS.contains(&id) {
        let _ = app.emit("menu-action", id);
    }
}
