//! SatLoc shell. The application itself is the web frontend in `../src`;
//! this crate only hosts the webview and, in later milestones, native
//! helpers (HTTP without CORS, on-disk TLE cache, notifications).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running SatLoc");
}
