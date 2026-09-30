// 生命周期见 AGENTS.md 与 docs/ARCHITECTURE.md：桌面壳只负责窗口与原生能力，
// 生命体逻辑全部在前端 core 模块中。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod pointer;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::TrayIconBuilder,
  Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// 系统声音监听开关（托盘勾选的真实状态，避免与 CheckMenuItem 自动切换打架）。
static SYS_AUDIO_ON: AtomicBool = AtomicBool::new(false);
/// 用户是否希望主窗置顶（设置面板盖在主窗上时会临时压掉）。
struct TrayInfo {
  life: MenuItem<tauri::Wry>,
  audio: MenuItem<tauri::Wry>,
  music: MenuItem<tauri::Wry>,
  pick_music: MenuItem<tauri::Wry>,
  stop_music: MenuItem<tauri::Wry>,
  audio_toggle: CheckMenuItem<tauri::Wry>,
}

/// 系统监听开启时禁用文件音乐入口，两者互斥。
fn set_file_music_enabled(app: &tauri::AppHandle, enabled: bool) {
  let info = app.state::<TrayInfo>();
  let _ = info.pick_music.set_enabled(enabled);
  let _ = info.stop_music.set_enabled(enabled);
}

#[tauri::command]
fn update_life_info(app: tauri::AppHandle, text: String) {
  let info = app.state::<TrayInfo>();
  let _ = info.life.set_text(text);
}

/// 托盘显示当前播放的音乐名；空字符串恢复占位。
#[tauri::command]
fn update_music_info(app: tauri::AppHandle, text: String) {
  let info = app.state::<TrayInfo>();
  let shown = if text.trim().is_empty() {
    "未播放音乐".to_string()
  } else if text.chars().count() > 28 {
    let mut s: String = text.chars().take(28).collect();
    s.push('…');
    format!("播放中：{s}")
  } else {
    format!("播放中：{text}")
  };
  if info.music.text().ok().as_deref() != Some(shown.as_str()) {
    let _ = info.music.set_text(shown);
  }
}

pub fn update_audio_info(app: &tauri::AppHandle, text: &str, failed: bool) {
  let info = app.state::<TrayInfo>();
  if info.audio.text().ok().as_deref() != Some(text) {
    let _ = info.audio.set_text(text);
  }
  if failed {
    SYS_AUDIO_ON.store(false, Ordering::SeqCst);
    let _ = info.audio_toggle.set_checked(false);
  }
}

static TOPMOST: AtomicBool = AtomicBool::new(true);

fn pick_audio_file() -> Option<String> {
  let out = std::process::Command::new("osascript")
    .args([
      "-e",
      r#"POSIX path of (choose file with prompt "选择音乐文件" of type {"public.audio","public.mp3","public.mpeg-4-audio","com.apple.m4a-audio","public.aiff-audio","com.microsoft.mp3"})"#,
    ])
    .output()
    .ok()?;
  if !out.status.success() {
    return None;
  }
  let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
  if path.is_empty() {
    None
  } else {
    Some(path)
  }
}

/// 设置期间只让粒子主窗穿透，设置窗始终可以点击。
fn effective_clickthrough(requested: bool, settings_open: bool) -> bool {
  requested || settings_open
}

fn apply_main_window_flags(app: &tauri::AppHandle, settings_open: bool) -> Result<(), String> {
  let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
  win.set_always_on_top(TOPMOST.load(Ordering::SeqCst) || settings_open).map_err(|e| e.to_string())?;
  win.set_ignore_cursor_events(effective_clickthrough(pointer::passthrough(), settings_open)).map_err(|e| e.to_string())?;
  Ok(())
}

/// 设置窗必须盖住全屏主窗，否则关穿透时点不到。
fn raise_settings_above_main(app: &tauri::AppHandle) {
  let settings = app.get_webview_window("settings");
  let main = app.get_webview_window("main");
  if let (Some(settings), Some(main)) = (settings, main) {
    // 保留粒子层可见，再抬起设置窗口。
    let _ = main.show();
    let _ = main.emit("life-visibility", true);
    let _ = apply_main_window_flags(app, true);
    let _ = settings.set_ignore_cursor_events(false);
    let _ = settings.set_always_on_top(false);
    let _ = settings.set_always_on_top(true);
    let _ = settings.show();
    let _ = settings.set_focus();
  }
}

fn restore_main_window_flags(app: &tauri::AppHandle) {
  let _ = apply_main_window_flags(app, false);
}

/// 设置窗位置：存物理像素，恢复时换算到当前缩放，避免 Retina 下偏移。
fn settings_pos_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  app.path().app_config_dir().ok().map(|d| d.join("settings-window.json"))
}

fn load_settings_pos_file(path: &std::path::Path) -> Option<(i32, i32)> {
  let raw = std::fs::read_to_string(path).ok()?;
  let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
  Some((v.get("x")?.as_i64()? as i32, v.get("y")?.as_i64()? as i32))
}

fn save_settings_pos_file(path: &std::path::Path, x: i32, y: i32) {
  if let Some(dir) = path.parent() {
    let _ = std::fs::create_dir_all(dir);
  }
  let _ = std::fs::write(path, format!("{{\"x\":{x},\"y\":{y}}}"));
}

fn load_settings_pos(app: &tauri::AppHandle) -> Option<(i32, i32)> {
  load_settings_pos_file(&settings_pos_path(app)?)
}

fn save_settings_pos(app: &tauri::AppHandle, x: i32, y: i32) {
  if let Some(path) = settings_pos_path(app) {
    save_settings_pos_file(&path, x, y);
  }
}

/// 把物理坐标夹进当前显示器可见区，防止换屏后开在屏外。
fn clamp_to_monitor(win: &tauri::WebviewWindow, x: i32, y: i32) -> (i32, i32) {
  let Ok(Some(monitor)) = win.primary_monitor() else {
    return (x, y);
  };
  let ms = monitor.size();
  let mp = monitor.position();
  let ws = win.outer_size().unwrap_or(*ms);
  let max_x = mp.x + ms.width.saturating_sub(ws.width.min(ms.width)) as i32;
  let max_y = mp.y + ms.height.saturating_sub(ws.height.min(ms.height)) as i32;
  (
    x.clamp(mp.x, max_x.max(mp.x)),
    y.clamp(mp.y, max_y.max(mp.y)),
  )
}

fn open_settings_window(app: &tauri::AppHandle) {
  if let Some(existing) = app.get_webview_window("settings") {
    raise_settings_above_main(app);
    // 已打开也校正一次，避免历史偏移坐标一直生效。
    if let Some((x, y)) = load_settings_pos(app) {
      let (x, y) = clamp_to_monitor(&existing, x, y);
      let _ = existing.set_position(tauri::PhysicalPosition::new(x, y));
    }
    return;
  }
  let mut builder = WebviewWindowBuilder::new(
    app,
    "settings",
    WebviewUrl::App("index.html?window=settings".into()),
  )
  .title("Emerge 设置")
  .inner_size(420.0, 720.0)
  .resizable(false)
  .decorations(true)
  .skip_taskbar(true)
  .always_on_top(true);
  // 无历史位置时先居中；有则创建后用物理坐标落到原位（与保存坐标同一坐标系）。
  if load_settings_pos(app).is_none() {
    builder = builder.center();
  }
  let built = builder.build();
  if let Ok(win) = built {
    if let Some((x, y)) = load_settings_pos(app) {
      let (x, y) = clamp_to_monitor(&win, x, y);
      let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
    raise_settings_above_main(app);
    let _ = win.set_focus();
  }
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) {
  open_settings_window(&app);
}

/// 读入用户选择的音乐文件字节（前端转 Blob 播放，绕开 asset 协议限制）。
#[tauri::command]
fn read_music_file(path: String) -> Result<tauri::ipc::Response, String> {
  let p = std::path::Path::new(&path);
  let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
  if !matches!(ext.as_str(), "mp3" | "m4a" | "wav" | "aac" | "ogg" | "flac" | "aiff" | "aif") {
    return Err(format!("不支持的音频格式：{ext}"));
  }
  if !p.is_file() {
    return Err(format!("文件不存在：{path}"));
  }
  let bytes = std::fs::read(p).map_err(|e| format!("读取失败：{e}"))?;
  Ok(tauri::ipc::Response::new(bytes))
}

/// 用户偏好与设置期间的临时状态分开，后台线程不再写窗口状态。
#[tauri::command]
fn apply_settings(app: tauri::AppHandle, topmost: bool, clickthrough: bool) -> Result<(), String> {
  TOPMOST.store(topmost, Ordering::SeqCst);
  pointer::set_passthrough(clickthrough);
  let settings_open = app.get_webview_window("settings").is_some();
  apply_main_window_flags(&app, settings_open)
}

/// 托盘高频动作：显示/隐藏、音乐、设置、退出。
fn handle_tray_event(app: &tauri::AppHandle, id: &str) {
  let Some(win) = app.get_webview_window("main") else {
    return;
  };
  match id {
    "showhide" => {
      if win.is_visible().unwrap_or(false) {
        let _ = win.emit("life-visibility", false);
        let _ = win.hide();
      } else {
        let _ = win.show();
        let _ = win.emit("life-visibility", true);
        let _ = win.set_focus();
      }
    }
    "audio-permission" => { let _ = audio::open_screen_recording_settings(); }
    "opensettings" => open_settings_window(app),
    "pickmusic" => {
      // 系统监听中不提供文件音乐（互斥）。
      if SYS_AUDIO_ON.load(Ordering::SeqCst) {
        return;
      }
      let win2 = win.clone();
      std::thread::spawn(move || {
        if let Some(path) = pick_audio_file() {
          let _ = win2.emit("music-file", path);
        }
      });
    }
    "stopmusic" => {
      let _ = win.emit("music-file", "");
    }
    "quit" => {
      app.exit(0);
    }
    _ => {}
  }
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      audio::system_audio_start,
      audio::system_audio_stop,
      audio::system_audio_read,
      audio::open_screen_recording_settings,
      audio::system_now_playing,
      open_settings,
      apply_settings,
      update_life_info,
      update_music_info,
      read_music_file
    ])
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(
          tauri_plugin_window_state::StateFlags::all()
            - tauri_plugin_window_state::StateFlags::SIZE
            - tauri_plugin_window_state::StateFlags::POSITION,
        )
        .build(),
    )
    .on_window_event(|window, event| {
      // 设置窗关闭后恢复用户的置顶和穿透偏好；记住窗口位置。
      if window.label() == "settings" {
        match event {
          WindowEvent::Moved(pos) => {
            save_settings_pos(window.app_handle(), pos.x, pos.y);
          }
          WindowEvent::Destroyed => {
            if let Ok(pos) = window.outer_position() {
              save_settings_pos(window.app_handle(), pos.x, pos.y);
            }
            restore_main_window_flags(window.app_handle());
          }
          _ => {}
        }
      }
    })
    .setup(|app| {
      let window = app.get_webview_window("main").expect("main window missing");
      if let Ok(Some(monitor)) = window.primary_monitor() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
      }
      let _ = window.set_shadow(false);

      let showhide = MenuItem::with_id(
        app,
        "showhide",
        "显示 / 隐藏",
        true,
        Some("CmdOrCtrl+Shift+E"),
      )?;
      let opensettings =
        MenuItem::with_id(app, "opensettings", "设置", true, Some("CmdOrCtrl+,"))?;
      let system_audio = CheckMenuItem::with_id(
        app,
        "systemaudio",
        "监听系统声音",
        true,
        false,
        Some("CmdOrCtrl+Shift+M"),
      )?;
      let pick_music = MenuItem::with_id(app, "pickmusic", "选择音乐文件…", true, None::<&str>)?;
      let stop_music = MenuItem::with_id(app, "stopmusic", "停止音乐", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "退出", true, Some("CmdOrCtrl+Q"))?;
      let life_info = MenuItem::with_id(app, "life-info", "生命信息加载中…", false, None::<&str>)?;
      let audio_info = MenuItem::with_id(app, "audio-info", "系统声音：未开启", false, None::<&str>)?;
      let music_info = MenuItem::with_id(app, "music-info", "未播放音乐", false, None::<&str>)?;
      let audio_permission = MenuItem::with_id(app, "audio-permission", "打开系统声音权限设置…", true, None::<&str>)?;
      app.manage(TrayInfo {
        life: life_info.clone(),
        audio: audio_info.clone(),
        music: music_info.clone(),
        pick_music: pick_music.clone(),
        stop_music: stop_music.clone(),
        audio_toggle: system_audio.clone(),
      });
      let sep_status = PredefinedMenuItem::separator(app)?;
      let sep_actions = PredefinedMenuItem::separator(app)?;
      // 顺序：状态信息 → 显示/声音/音乐动作 → 设置与退出。
      let menu = Menu::with_items(
        app,
        &[
          &life_info,
          &audio_info,
          &music_info,
          &sep_status,
          &showhide,
          &system_audio,
          &pick_music,
          &stop_music,
          &audio_permission,
          &sep_actions,
          &opensettings,
          &quit,
        ],
      )?;
      let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().expect("default icon").clone())
        .tooltip("Emerge · Particle Life")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .build(app)?;

      pointer::spawn(app.handle().clone());

      pointer::set_passthrough(true);
      let _ = window.set_ignore_cursor_events(true);
      let _ = window.set_always_on_top(true);

      let system_audio_ref = system_audio.clone();
      app.on_menu_event(move |app, event| {
        let Some(win) = app.get_webview_window("main") else {
          return;
        };
        match event.id().as_ref() {
          "systemaudio" => {
            // 用原子开关决定动作，不依赖 is_capturing，保证能取消勾选。
            let turn_on = !SYS_AUDIO_ON.load(Ordering::SeqCst);
            if turn_on {
              audio::system_audio_stop();
              match audio::system_audio_start() {
                Ok(()) => {
                  SYS_AUDIO_ON.store(true, Ordering::SeqCst);
                  let _ = system_audio_ref.set_checked(true);
                  // 互斥：系统监听期间停掉文件音乐，并禁用选择入口。
                  let _ = win.emit("music-file", "");
                  set_file_music_enabled(app, false);
                }
                Err(e) => {
                  SYS_AUDIO_ON.store(false, Ordering::SeqCst);
                  let _ = system_audio_ref.set_checked(false);
                  set_file_music_enabled(app, true);
                  let _ = win.emit("audio-error", e);
                }
              }
            } else {
              audio::system_audio_stop();
              SYS_AUDIO_ON.store(false, Ordering::SeqCst);
              let _ = system_audio_ref.set_checked(false);
              set_file_music_enabled(app, true);
            }
          }
          _ => handle_tray_event(app, event.id().as_ref()),
        }
      });

      window.show()?;
      let _ = window.set_focus();

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}


#[cfg(test)]
mod window_tests {
  use super::{effective_clickthrough, load_settings_pos_file, save_settings_pos_file};
  #[test]
  fn settings_temporarily_pass_through_without_changing_preference() {
    for requested in [false, true] {
      assert_eq!(effective_clickthrough(requested, false), requested);
      assert!(effective_clickthrough(requested, true));
      assert_eq!(effective_clickthrough(requested, false), requested);
    }
  }

  #[test]
  fn settings_window_position_roundtrip_and_corrupt_file() {
    let dir = std::env::temp_dir().join(format!("emerge-settings-pos-{}", std::process::id()));
    let path = dir.join("settings-window.json");
    save_settings_pos_file(&path, 120, 80);
    assert_eq!(load_settings_pos_file(&path), Some((120, 80)));
    std::fs::write(&path, "not-json").unwrap();
    assert_eq!(load_settings_pos_file(&path), None);
    std::fs::write(&path, "{\"x\":1.5}").unwrap();
    assert_eq!(load_settings_pos_file(&path), None);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
