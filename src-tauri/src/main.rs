// 生命周期见 AGENTS.md 与 docs/ARCHITECTURE.md：桌面壳只负责窗口与原生能力，
// 生命体逻辑全部在前端 core 模块中。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod pointer;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::TrayIconBuilder,
  AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// 系统声音监听开关（托盘勾选的真实状态，避免与 CheckMenuItem 自动切换打架）。
static SYS_AUDIO_ON: AtomicBool = AtomicBool::new(false);
/// 界面语言（false = 中文，true = English）；由前端 `set_ui_locale` 同步。
static UI_LOCALE_EN: AtomicBool = AtomicBool::new(false);
/// 托盘菜单句柄：语言切换重建菜单后，动态文本更新需要拿到最新一组。
static TRAY_HANDLES: Mutex<Option<TrayHandles>> = Mutex::new(None);

/// 按 UI 语言取文案（zh 默认，en 备选）。
pub fn l(zh: &'static str, en: &'static str) -> &'static str {
  if UI_LOCALE_EN.load(Ordering::SeqCst) {
    en
  } else {
    zh
  }
}

struct TrayHandles {
  life: MenuItem<tauri::Wry>,
  audio: MenuItem<tauri::Wry>,
  music: MenuItem<tauri::Wry>,
  pick_music: MenuItem<tauri::Wry>,
  stop_music: MenuItem<tauri::Wry>,
  audio_toggle: CheckMenuItem<tauri::Wry>,
}

fn with_tray<R>(f: impl FnOnce(&TrayHandles) -> R) -> Option<R> {
  let guard = TRAY_HANDLES.lock().ok()?;
  guard.as_ref().map(f)
}

/// 系统监听开启时禁用文件音乐入口，两者互斥。
fn set_file_music_enabled(_app: &AppHandle, enabled: bool) {
  with_tray(|h| {
    let _ = h.pick_music.set_enabled(enabled);
    let _ = h.stop_music.set_enabled(enabled);
  });
}

#[tauri::command]
fn update_life_info(_app: AppHandle, text: String) {
  with_tray(|h| {
    let _ = h.life.set_text(text);
  });
}

/// 托盘显示当前播放的音乐名；空字符串恢复占位。
#[tauri::command]
fn update_music_info(_app: AppHandle, text: String) {
  with_tray(|h| {
    let shown = if text.trim().is_empty() {
      l("未播放音乐", "No music playing").to_string()
    } else if text.chars().count() > 28 {
      let mut s: String = text.chars().take(28).collect();
      s.push('…');
      format!("{}：{s}", l("播放中", "Playing"))
    } else {
      format!("{}：{text}", l("播放中", "Playing"))
    };
    if h.music.text().ok().as_deref() != Some(shown.as_str()) {
      let _ = h.music.set_text(shown);
    }
  });
}

pub fn update_audio_info(_app: &AppHandle, text: &str, failed: bool) {
  with_tray(|h| {
    if h.audio.text().ok().as_deref() != Some(text) {
      let _ = h.audio.set_text(text);
    }
    if failed {
      SYS_AUDIO_ON.store(false, Ordering::SeqCst);
      let _ = h.audio_toggle.set_checked(false);
      let _ = h.pick_music.set_enabled(true);
      let _ = h.stop_music.set_enabled(true);
    }
  });
}

static TOPMOST: AtomicBool = AtomicBool::new(true);
static OBSERVATORY_OPEN: AtomicBool = AtomicBool::new(false);

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
fn effective_clickthrough(requested: bool, settings_open: bool, observatory_open: bool) -> bool {
  settings_open || (requested && !observatory_open)
}

fn apply_main_window_flags(app: &tauri::AppHandle, settings_open: bool) -> Result<(), String> {
  let win = app.get_webview_window("main").ok_or("主窗口不可用")?;
  // 设置窗必须盖住全屏主窗：设置打开时主窗暂时取消置顶，避免两窗互相压叠导致设置“空白/点不到”。
  let topmost = TOPMOST.load(Ordering::SeqCst) && !settings_open;
  win.set_always_on_top(topmost).map_err(|e| e.to_string())?;
  win.set_ignore_cursor_events(effective_clickthrough(pointer::passthrough(), settings_open, OBSERVATORY_OPEN.load(Ordering::SeqCst))).map_err(|e| e.to_string())?;
  Ok(())
}

/// 设置窗必须盖住全屏主窗，否则关穿透时点不到。
fn raise_settings_above_main(app: &tauri::AppHandle) {
  let settings = app.get_webview_window("settings");
  let main = app.get_webview_window("main");
  if let (Some(settings), Some(main)) = (settings, main) {
    // 通知主窗退出观察空间，避免暗色遮罩盖住设置。
    let _ = main.emit("close-observatory", ());
    // 保留粒子层可见，再抬起设置窗口。
    let _ = main.show();
    let _ = main.emit("life-visibility", true);
    let _ = apply_main_window_flags(app, true);
    let _ = settings.set_ignore_cursor_events(false);
    // 设置窗单独置顶；主窗已取消置顶，叠放稳定。
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

/// 按当前语言构建托盘菜单与句柄组。
fn build_tray_menu(app: &AppHandle) -> tauri::Result<(Menu<tauri::Wry>, TrayHandles)> {
  let showhide = MenuItem::with_id(
    app,
    "showhide",
    l("显示 / 隐藏", "Show / Hide"),
    true,
    Some("CmdOrCtrl+Shift+E"),
  )?;
  let opensettings =
    MenuItem::with_id(app, "opensettings", l("设置", "Settings"), true, Some("CmdOrCtrl+,"))?;
  let system_audio = CheckMenuItem::with_id(
    app,
    "systemaudio",
    l("监听系统声音", "Listen to System Audio"),
    true,
    false,
    Some("CmdOrCtrl+Shift+M"),
  )?;
  let pick_music =
    MenuItem::with_id(app, "pickmusic", l("选择音乐文件…", "Pick a Music File…"), true, None::<&str>)?;
  let stop_music = MenuItem::with_id(app, "stopmusic", l("停止音乐", "Stop Music"), true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", l("退出", "Quit"), true, Some("CmdOrCtrl+Q"))?;
  let life_info =
    MenuItem::with_id(app, "life-info", l("生命信息加载中…", "Life info loading…"), false, None::<&str>)?;
  let audio_info =
    MenuItem::with_id(app, "audio-info", l("系统声音：未开启", "System audio: off"), false, None::<&str>)?;
  let music_info =
    MenuItem::with_id(app, "music-info", l("未播放音乐", "No music playing"), false, None::<&str>)?;
  let audio_permission = MenuItem::with_id(
    app,
    "audio-permission",
    l("打开系统声音权限设置…", "Open System Audio Privacy Settings…"),
    true,
    None::<&str>,
  )?;
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
  Ok((
    menu,
    TrayHandles {
      life: life_info,
      audio: audio_info,
      music: music_info,
      pick_music,
      stop_music,
      audio_toggle: system_audio,
    },
  ))
}

/// 语言切换后按新文案重建托盘菜单，并恢复勾选/互斥状态。
fn rebuild_tray(app: &AppHandle) -> tauri::Result<()> {
  let (menu, handles) = build_tray_menu(app)?;
  if let Some(tray) = app.tray_by_id("main-tray") {
    tray.set_menu(Some(menu))?;
  }
  let on = SYS_AUDIO_ON.load(Ordering::SeqCst);
  let _ = handles.audio_toggle.set_checked(on);
  let _ = handles.pick_music.set_enabled(!on);
  let _ = handles.stop_music.set_enabled(!on);
  *TRAY_HANDLES.lock().expect("tray handles poisoned") = Some(handles);
  Ok(())
}

/// 保留平台默认编辑菜单，给 macOS 应用菜单补上设置快捷键。
fn rebuild_app_menu(app: &AppHandle) -> tauri::Result<()> {
  let menu = Menu::default(app)?;
  #[cfg(target_os = "macos")]
  if let Some(item) = menu.items()?.first() {
    if let Some(submenu) = item.as_submenu() {
      let settings = MenuItem::with_id(app, "opensettings", l("设置…", "Settings…"), true, Some("CmdOrCtrl+,"))?;
      submenu.insert(&settings, 1)?;
      let observe = MenuItem::with_id(app, "openobservatory", l("观察空间…", "Observatory…"), true, Some("CmdOrCtrl+O"))?;
      submenu.insert(&observe, 2)?;
    }
  }
  app.set_menu(menu)?;
  Ok(())
}

/// 前端同步界面语言：重建托盘菜单与设置窗标题。
#[tauri::command]
fn set_ui_locale(app: AppHandle, locale: String) {
  let en = locale == "en";
  let zh = locale == "zh";
  if !en && !zh {
    return;
  }
  if UI_LOCALE_EN.load(Ordering::SeqCst) != en {
    UI_LOCALE_EN.store(en, Ordering::SeqCst);
    let _ = rebuild_app_menu(&app);
    if let Err(e) = rebuild_tray(&app) {
      eprintln!("[tray] rebuild failed: {e}");
    }
  }
  if let Some(win) = app.get_webview_window("settings") {
    let _ = win.set_title(l("Emerge 设置", "Emerge Settings"));
  }
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
  .title(l("Emerge 设置", "Emerge Settings"))
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

/// 全屏粒子层中的 UI 使用系统工作区，避开菜单栏、刘海与 Dock。
fn work_area_insets(window: (f64, f64, f64, f64), area: (f64, f64, f64, f64), scale: f64) -> [f64; 4] {
  let (x, y, w, h) = window;
  let (ax, ay, aw, ah) = area;
  let scale = scale.max(1.0);
  [((ay - y).max(0.0).min(h)) / scale,
   ((x + w - ax - aw).max(0.0).min(w)) / scale,
   ((y + h - ay - ah).max(0.0).min(h)) / scale,
   ((ax - x).max(0.0).min(w)) / scale]
}

#[tauri::command]
fn desktop_content_insets(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
  let monitor = window.current_monitor().map_err(|e| e.to_string())?.ok_or("显示器不可用")?;
  let area = monitor.work_area();
  let pos = window.inner_position().map_err(|e| e.to_string())?;
  let size = window.inner_size().map_err(|e| e.to_string())?;
  let mut inset = work_area_insets(
    (pos.x as f64, pos.y as f64, size.width as f64, size.height as f64),
    (area.position.x as f64, area.position.y as f64, area.size.width as f64, area.size.height as f64),
    window.scale_factor().map_err(|e| e.to_string())?);
  // 菜单栏自动隐藏时工作区可能覆盖整屏，仍留出顶部交互空间。
  #[cfg(target_os = "macos")]
  { inset[0] = inset[0].max(40.0); }
  Ok(serde_json::json!({ "top": inset[0], "right": inset[1], "bottom": inset[2], "left": inset[3] }))
}

/// 观察空间临时接收输入，不改用户的置顶/穿透偏好。
#[tauri::command]
fn set_observatory_open(app: AppHandle, open: bool) -> Result<(), String> {
  OBSERVATORY_OPEN.store(open, Ordering::SeqCst);
  apply_main_window_flags(&app, app.get_webview_window("settings").is_some())?;
  if open {
    if let Some(win) = app.get_webview_window("main") { win.set_focus().map_err(|e| e.to_string())?; }
  }
  Ok(())
}

/// 文件选择器可能在系统监听开始前已打开；确认选择时再次检查互斥。
#[tauri::command]
fn ensure_file_music_available() -> Result<(), String> {
  if SYS_AUDIO_ON.load(Ordering::SeqCst) {
    return Err(l("请先停止系统声音监听，再选择音乐文件", "Stop system audio before choosing a music file").into());
  }
  Ok(())
}

/// 观察空间与托盘共用的系统音频开关，保持文件播放互斥和菜单状态一致。
#[tauri::command]
fn set_system_audio_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
  if enabled && SYS_AUDIO_ON.load(Ordering::SeqCst) { return Ok(()); }
  audio::system_audio_stop();
  SYS_AUDIO_ON.store(false, Ordering::SeqCst);
  let result = if enabled { audio::system_audio_start() } else { Ok(()) };
  let on = enabled && result.is_ok();
  SYS_AUDIO_ON.store(on, Ordering::SeqCst);
  with_tray(|h| { let _ = h.audio_toggle.set_checked(on); });
  set_file_music_enabled(&app, !on);
  if on {
    if let Some(win) = app.get_webview_window("main") { let _ = win.emit("music-file", ""); }
  }
  result
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
    "openobservatory" => {
      if let Some(settings) = app.get_webview_window("settings") { let _ = settings.close(); }
      let _ = win.show();
      let _ = win.emit("life-visibility", true);
      let _ = win.emit("open-observatory", ());
    }
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
      set_ui_locale,
      read_music_file,
      set_system_audio_enabled,
      set_observatory_open,
      ensure_file_music_available,
      desktop_content_insets
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
      rebuild_app_menu(app.handle())?;
      let window = app.get_webview_window("main").expect("main window missing");
      if let Ok(Some(monitor)) = window.primary_monitor() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
      }
      let _ = window.set_shadow(false);

      let (menu, handles) = build_tray_menu(app.handle())?;
      *TRAY_HANDLES.lock().expect("tray handles poisoned") = Some(handles);
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

      app.on_menu_event(move |app, event| {
        let Some(win) = app.get_webview_window("main") else {
          return;
        };
        match event.id().as_ref() {
          "systemaudio" => {
            let turn_on = !SYS_AUDIO_ON.load(Ordering::SeqCst);
            if let Err(e) = set_system_audio_enabled(app.clone(), turn_on) {
              let _ = win.emit("audio-error", e);
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
      assert_eq!(effective_clickthrough(requested, false, false), requested);
      assert!(effective_clickthrough(requested, true, false));
      assert_eq!(effective_clickthrough(requested, false, false), requested);
    }
  }

  #[test]
  fn work_area_insets_respect_retina_and_offset_monitors() {
    assert_eq!(super::work_area_insets((0., 0., 3024., 1964.), (0., 74., 3024., 1790.), 2.), [37., 0., 50., 0.]);
    assert_eq!(super::work_area_insets((-1920., 0., 1920., 1080.), (-1920., 24., 1860., 1056.), 1.), [24., 60., 0., 0.]);
  }

  #[test]
  fn observatory_receives_input_but_settings_still_take_priority() {
    assert!(!effective_clickthrough(true, false, true));
    assert!(!effective_clickthrough(false, false, true));
    assert!(effective_clickthrough(true, true, true));
    assert!(effective_clickthrough(false, true, true));
    assert!(effective_clickthrough(true, false, false));
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
