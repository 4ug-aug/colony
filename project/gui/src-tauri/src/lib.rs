use tauri::{Manager, Url};
use tauri_plugin_opener::OpenerExt;

// The app's own origin is derived statically on purpose. This runs from a
// synchronous webview callback on the UI thread, where a blocking runtime getter
// like `webview.url()` reenters the event loop and deadlocks the very first
// navigation on Windows: white window, "not responding", no page ever loads.
fn should_open_externally(target: &Url) -> bool {
  match target.scheme() {
    // Sweat serves itself from `tauri://localhost` on macOS and Linux and from
    // `http://tauri.localhost` on Windows; in development it is the Vite server
    // on localhost. Every other web address belongs in the user's browser.
    "http" | "https" => !matches!(
      target.host_str(),
      Some("tauri.localhost" | "localhost" | "127.0.0.1")
    ),
    "mailto" | "tel" => true,
    _ => false,
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  // Single-instance has to be the first plugin registered. On Windows and Linux
  // a deep link launches a second process; the plugin's `deep-link` feature
  // replays the URL onto the running instance, which then only needs focusing.
  #[cfg(any(target_os = "windows", target_os = "linux"))]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
      }
    }));
  }

  builder
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(
      tauri::plugin::Builder::<_, ()>::new("external-links")
        .on_navigation(|webview, target| {
          if !should_open_externally(target) {
            return true;
          }
          if let Err(error) = webview
            .app_handle()
            .opener()
            .open_url(target.as_str(), None::<&str>)
          {
            log::error!("failed to open external URL: {error}");
          }
          false
        })
        .build(),
    )
    .plugin(tauri_plugin_websocket::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .setup(|app| {
      // Installed builds carry no web inspector, so LogDir stays on in release:
      // that file is the only thing a user can be asked to send back.
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
              file_name: None,
            }),
          ])
          .build(),
      )?;
      log::info!(
        "sweat {} starting on {}",
        app.package_info().version,
        std::env::consts::OS
      );
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_safe_external_links_leave_the_webview() {
    // Every origin Sweat serves itself from has to stay in the webview. The
    // Windows one is what the first navigation uses, so missing it bounces the
    // whole app out to a browser on launch.
    assert!(!should_open_externally(
      &Url::parse("tauri://localhost/rooms/2").unwrap()
    ));
    assert!(!should_open_externally(
      &Url::parse("http://tauri.localhost/rooms/2").unwrap()
    ));
    assert!(!should_open_externally(
      &Url::parse("http://localhost:3000/rooms/2").unwrap()
    ));

    assert!(should_open_externally(
      &Url::parse("https://example.com").unwrap()
    ));
    assert!(should_open_externally(
      &Url::parse("mailto:hello@example.com").unwrap()
    ));
    assert!(!should_open_externally(
      &Url::parse("javascript:alert(1)").unwrap()
    ));
  }
}
