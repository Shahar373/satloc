//! SatLoc shell. The application itself is the web frontend in `../src`;
//! this crate only hosts the webview and, in later milestones, native
//! helpers (HTTP without CORS, on-disk TLE cache, notifications).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running SatLoc");
}
