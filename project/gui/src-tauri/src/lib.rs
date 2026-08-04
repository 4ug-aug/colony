use tauri::{Manager, Url};
use tauri_plugin_opener::OpenerExt;

// Called from a synchronous webview callback on the UI thread, so it must not
// touch blocking runtime getters like `webview.url()`. Those reenter the event
// loop, and on Windows that wedges the very first navigation: the window paints
// white, the title bar reads "not responding", and no page ever loads. Deriving
// the app's own origin statically avoids the getter entirely.
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
      // A second launch exits inside this plugin, before `setup` runs, so it
      // never writes a startup line of its own. This one is written by the
      // *first* process instead: seeing it means an already-running instance
      // swallowed the launch, which looks identical to "the app did nothing".
      log::info!("second launch handed off to the running instance");
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
          // First statement in the hook, so a hang inside it stays attributable
          // to this hook rather than to the webview that never loaded.
          log::info!("navigation to {target}");
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
      // Installed builds have no web inspector, so the log file is the only
      // channel for diagnosing a report like "blank window". Keep LogDir in
      // release; it is the file a user can be asked to send back.
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
      // Windows ships whatever WebView2 the machine happens to have, and that
      // version decides which JavaScript syntax the bundle may use. A blank
      // window plus an old version here means the bundle out-ran the runtime.
      match tauri::webview_version() {
        Ok(version) => log::info!("webview runtime {version}"),
        Err(error) => log::error!("no webview runtime: {error}"),
      }
      Ok(())
    })
    .on_page_load(|_webview, payload| {
      // Written from Rust, so it survives a frontend bundle that never runs a
      // single statement. No `page load started` line at all means the webview
      // never reached the bundled HTML — a packaging fault, not a JS one.
      let event = match payload.event() {
        tauri::webview::PageLoadEvent::Started => "started",
        tauri::webview::PageLoadEvent::Finished => "finished",
      };
      log::info!("page load {event}: {}", payload.url());
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_safe_external_links_leave_the_webview() {
    // The three origins Sweat serves itself from must stay in the webview; the
    // Windows one is what the first navigation uses, so getting it wrong here
    // bounces the whole app out to a browser on launch.
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
