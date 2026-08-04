use tauri::{Manager, Url};
use tauri_plugin_opener::OpenerExt;

fn should_open_externally(current: &Url, target: &Url) -> bool {
  match target.scheme() {
    "http" | "https" => current.origin() != target.origin(),
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
          let should_open = webview
            .url()
            .is_ok_and(|current| should_open_externally(&current, target));
          if should_open {
            if let Err(error) = webview
              .app_handle()
              .opener()
              .open_url(target.as_str(), None::<&str>)
            {
              log::error!("failed to open external URL: {error}");
            }
          }
          !should_open
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
    let current = Url::parse("tauri://localhost/rooms/1").unwrap();

    assert!(!should_open_externally(
      &current,
      &Url::parse("tauri://localhost/rooms/2").unwrap()
    ));
    assert!(should_open_externally(
      &current,
      &Url::parse("https://example.com").unwrap()
    ));
    assert!(should_open_externally(
      &current,
      &Url::parse("mailto:hello@example.com").unwrap()
    ));
    assert!(!should_open_externally(
      &current,
      &Url::parse("javascript:alert(1)").unwrap()
    ));
  }
}
