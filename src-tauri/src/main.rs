// 生命周期见 AGENTS.md 与 docs/ARCHITECTURE.md：桌面壳只负责窗口与原生能力，
// 生命体逻辑全部在前端 core 模块中。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod pointer;
mod locale;
use locale::tr;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
  menu::{AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
  tray::TrayIconBuilder,
  AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// 系统声音监听开关（托盘勾选的真实状态，避免与 CheckMenuItem 自动切换打架）。
static SYS_AUDIO_ON: AtomicBool = AtomicBool::new(false);
/// 托盘菜单句柄：语言切换重建菜单后，动态文本更新需要拿到最新一组。
#[derive(Clone)]
struct NativeLifeInfo { days: u32, stage: String, pct: u32 }
static LIFE_INFO: Mutex<Option<NativeLifeInfo>> = Mutex::new(None);
static MUSIC_NAME: Mutex<String> = Mutex::new(String::new());
static TRAY_HANDLES: Mutex<Option<TrayHandles>> = Mutex::new(None);

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

fn life_info_text(info: &NativeLifeInfo) -> String {
  let stage = locale::stage_name(&info.stage);
  format!("{}{} · {} {} {}%", info.days, tr("unit.days"), stage, tr("unit.growth"), info.pct)
}
#[tauri::command]
fn update_life_info(_app: AppHandle, days: u32, stage: String, pct: u32) {
  let info = NativeLifeInfo { days, stage, pct };
  if let Ok(mut cached) = LIFE_INFO.lock() { *cached = Some(info.clone()); }
  with_tray(|h| { let _ = h.life.set_text(life_info_text(&info)); });
}
fn music_info_text(text: &str) -> String {
  if text.trim().is_empty() { return tr("native.noMusic").to_string(); }
  let mut name: String = text.chars().take(28).collect();
  if text.chars().count() > 28 { name.push('…'); }
  locale::format("native.playing", &[("name", &name)])
}
/// 托盘显示当前播放的音乐名；空字符串恢复占位。
#[tauri::command]
fn update_music_info(_app: AppHandle, text: String) {
  if let Ok(mut cached) = MUSIC_NAME.lock() { *cached = text.clone(); }
  with_tray(|h| {
    let shown = music_info_text(&text);
    if h.music.text().ok().as_deref() != Some(shown.as_str()) { let _ = h.music.set_text(shown); }
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
  let prompt = tr("native.pickPrompt");
  let script = format!(r#"POSIX path of (choose file with prompt "{prompt}" of type {{"public.audio","public.mp3","public.mpeg-4-audio","com.apple.m4a-audio","public.aiff-audio","com.microsoft.mp3"}})"#);
  let out = std::process::Command::new("osascript")
    .args([
      "-e",
      &script,
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
  let win = app.get_webview_window("main").ok_or(tr("error.mainUnavailable"))?;
  // 设置窗必须盖住全屏主窗：设置打开时主窗暂时取消置顶，避免两窗互相压叠导致设置“空白/点不到”。
  let auxiliary_open = settings_open || app.get_webview_window("welcome").is_some();
  let topmost = TOPMOST.load(Ordering::SeqCst) && !auxiliary_open;
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
    tr("native.showHide"),
    true,
    Some("CmdOrCtrl+Shift+E"),
  )?;
  let opensettings =
    MenuItem::with_id(app, "opensettings", tr("native.settings"), true, Some("CmdOrCtrl+,"))?;
  let system_audio = CheckMenuItem::with_id(
    app,
    "systemaudio",
    tr("native.listen"),
    true,
    false,
    Some("CmdOrCtrl+Shift+M"),
  )?;
  let pick_music =
    MenuItem::with_id(app, "pickmusic", tr("native.pickMusic"), true, None::<&str>)?;
  let stop_music = MenuItem::with_id(app, "stopmusic", tr("native.stopMusic"), true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", tr("native.quit"), true, Some("CmdOrCtrl+Q"))?;
  let life_info =
    MenuItem::with_id(app, "life-info", tr("native.lifeLoading"), false, None::<&str>)?;
  let audio_info =
    MenuItem::with_id(app, "audio-info", tr("native.audioOff"), false, None::<&str>)?;
  let music_info =
    MenuItem::with_id(app, "music-info", tr("native.noMusic"), false, None::<&str>)?;
  let audio_permission = MenuItem::with_id(
    app,
    "audio-permission",
    tr("native.audioPrivacy"),
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
  if let Ok(cached) = LIFE_INFO.lock() {
    if let Some(info) = cached.as_ref() { let _ = handles.life.set_text(life_info_text(info)); }
  }
  if let Ok(name) = MUSIC_NAME.lock() { let _ = handles.music.set_text(music_info_text(&name)); }
  *TRAY_HANDLES.lock().expect("tray handles poisoned") = Some(handles);
  let _ = audio::system_audio_read(app.clone());
  Ok(())
}

/// 保留标准菜单的原生行为与快捷键，全部标题使用当前界面语言。
fn rebuild_app_menu(app: &AppHandle) -> tauri::Result<()> {
  let metadata = AboutMetadata {
    name: Some("Emerge".into()), version: Some(app.package_info().version.to_string()),
    ..Default::default()
  };
  let window = Submenu::with_id_and_items(app, "__tauri_window_menu__", tr("native.window"), true, &[
    &PredefinedMenuItem::minimize(app, Some(tr("native.minimize")))?,
    &PredefinedMenuItem::maximize(app, Some(tr("native.maximize")))?,
    &PredefinedMenuItem::separator(app)?,
    &PredefinedMenuItem::close_window(app, Some(tr("native.close")))?,
  ])?;
  let help = Submenu::with_id_and_items(app, "__tauri_help_menu__", tr("native.help"), true, &[
    #[cfg(not(target_os = "macos"))]
    &PredefinedMenuItem::about(app, Some(tr("native.about")), Some(metadata.clone()))?,
  ])?;
  let menu = Menu::with_items(app, &[
    #[cfg(target_os = "macos")]
    &Submenu::with_items(app, "Emerge", true, &[
      &PredefinedMenuItem::about(app, Some(tr("native.about")), Some(metadata))?,
      &MenuItem::with_id(app, "opensettings", tr("native.settingsMenu"), true, Some("CmdOrCtrl+,"))?,
      &MenuItem::with_id(app, "openobservatory", tr("native.observatory"), true, Some("CmdOrCtrl+O"))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::services(app, Some(tr("native.services")))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::hide(app, Some(tr("native.hide")))?,
      &PredefinedMenuItem::hide_others(app, Some(tr("native.hideOthers")))?,
      &PredefinedMenuItem::show_all(app, Some(tr("native.showAll")))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::quit(app, Some(tr("native.quit")))?,
    ])?,
    &Submenu::with_items(app, tr("native.file"), true, &[
      &PredefinedMenuItem::close_window(app, Some(tr("native.close")))?,
      #[cfg(not(target_os = "macos"))]
      &PredefinedMenuItem::quit(app, Some(tr("native.quit")))?,
    ])?,
    &Submenu::with_items(app, tr("native.edit"), true, &[
      &PredefinedMenuItem::undo(app, Some(tr("native.undo")))?,
      &PredefinedMenuItem::redo(app, Some(tr("native.redo")))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::cut(app, Some(tr("native.cut")))?,
      &PredefinedMenuItem::copy(app, Some(tr("native.copy")))?,
      &PredefinedMenuItem::paste(app, Some(tr("native.paste")))?,
      &PredefinedMenuItem::select_all(app, Some(tr("native.selectAll")))?,
    ])?,
    #[cfg(target_os = "macos")]
    &Submenu::with_items(app, tr("native.view"), true, &[
      &PredefinedMenuItem::fullscreen(app, Some(tr("native.fullscreen")))?,
    ])?,
    &window, &help,
  ])?;
  app.set_menu(menu)?;
  Ok(())
}

/// 前端同步界面语言：重建托盘菜单与设置窗标题。
/// 中/英/日/韩共用前端词表；各语言分别重建菜单与辅助窗口标题。
#[tauri::command]
fn set_ui_locale(app: AppHandle, locale: String) {
  if locale::set_locale(&locale) {
    let _ = rebuild_app_menu(&app);
    if let Err(e) = rebuild_tray(&app) {
      eprintln!("[tray] rebuild failed: {e}");
    }
  }
  if let Some(win) = app.get_webview_window("settings") {
    let _ = win.set_title(tr("native.settingsTitle"));
  }
  if let Some(win) = app.get_webview_window("welcome") {
    let _ = win.set_title(tr("native.welcomeTitle"));
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
  .title(tr("native.settingsTitle"))
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
    return Err(locale::format("error.audioFormat", &[("ext", &ext)]));
  }
  if !p.is_file() {
    return Err(locale::format("error.fileMissing", &[("path", &path)]));
  }
  let bytes = std::fs::read(p).map_err(|e| locale::format("error.fileRead", &[("e", &e.to_string())]))?;
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

/// 引导完成标记独立于生命存档；写入成功后才关闭欢迎窗。
fn onboarding_done_file(path: &std::path::Path) -> bool {
  std::fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    .map(|v| v.get("completed").and_then(|x| x.as_bool()) == Some(true)).unwrap_or(false)
}

fn save_onboarding_state(path: &std::path::Path, completed: bool) -> Result<(), String> {
  if let Some(dir) = path.parent() { std::fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
  let temporary = path.with_extension("tmp");
  let contents = serde_json::json!({ "version": 1, "completed": completed }).to_string();
  std::fs::write(&temporary, contents).map_err(|e| e.to_string())?;
  std::fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn save_onboarding_done(path: &std::path::Path) -> Result<(), String> {
  save_onboarding_state(path, true)
}

fn onboarding_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  app.path().app_config_dir().map(|dir| dir.join("onboarding.json")).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_onboarding(app: AppHandle) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window("welcome") {
    if let Some(settings) = app.get_webview_window("settings") { settings.close().map_err(|e| e.to_string())?; }
    apply_main_window_flags(&app, false)?;
    existing.show().map_err(|e| e.to_string())?;
    return existing.set_focus().map_err(|e| e.to_string());
  }
  let main = app.get_webview_window("main").ok_or(tr("error.mainUnavailable"))?;
  let available = main.current_monitor().ok().flatten().map(|m| {
    (m.work_area().size.width as f64 / m.scale_factor(), m.work_area().size.height as f64 / m.scale_factor())
  }).unwrap_or((800., 800.));
  let welcome = WebviewWindowBuilder::new(&app, "welcome", WebviewUrl::App("index.html?window=welcome".into()))
    .title(tr("native.welcomeTitle"))
    .inner_size(560f64.min((available.0 - 48.).max(360.)), 640f64.min((available.1 - 60.).max(420.)))
    .min_inner_size(360., 420.).resizable(true).decorations(true).skip_taskbar(true).always_on_top(true).center()
    .build().map_err(|e| e.to_string())?;
  if let Some(settings) = app.get_webview_window("settings") { settings.close().map_err(|e| e.to_string())?; }
  let _ = main.emit("close-observatory", ());
  main.show().map_err(|e| e.to_string())?;
  let _ = main.emit("life-visibility", true);
  apply_main_window_flags(&app, false)?;
  welcome.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_onboarding_if_needed(app: AppHandle, existing_life: bool) -> Result<(), String> {
  let path = onboarding_path(&app)?;
  if onboarding_done_file(&path) { return Ok(()); }
  // 升级用户不强制重走引导，仍可从设置手动打开。
  if existing_life && !path.exists() { return save_onboarding_done(&path); }
  if !path.exists() { save_onboarding_state(&path, false)?; }
  open_onboarding(app)
}

#[tauri::command]
fn complete_onboarding(app: AppHandle) -> Result<(), String> {
  // 引导完成即收尾：只落完成标记并关闭欢迎窗，不再顺带打开设置。
  if let Err(error) = save_onboarding_done(&onboarding_path(&app)?) {
    if let Some(welcome) = app.get_webview_window("welcome") { let _ = welcome.set_focus(); }
    return Err(error);
  }
  if let Some(welcome) = app.get_webview_window("welcome") { welcome.close().map_err(|e| e.to_string())?; }
  Ok(())
}

#[tauri::command]
fn onboarding_pick_music(app: AppHandle) -> Result<(), String> {
  ensure_file_music_available()?;
  handle_tray_event(&app, "pickmusic");
  Ok(())
}

/// 供欢迎引导页停止文件音乐：与托盘「停止音乐」同一通道（music-file 空路径）。
#[tauri::command]
fn stop_music(app: AppHandle) -> Result<(), String> {
  if let Some(win) = app.get_webview_window("main") {
    let _ = win.emit("music-file", "");
  }
  Ok(())
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
  let monitor = window.current_monitor().map_err(|e| e.to_string())?.ok_or(tr("error.monitorUnavailable"))?;
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
    return Err(tr("error.stopSystemFirst").into());
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
      desktop_content_insets,
      open_onboarding,
      show_onboarding_if_needed,
      complete_onboarding,
      onboarding_pick_music,
      stop_music
    ])
    .plugin(
      tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
      ),
    )
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
      if window.label() == "welcome" && matches!(event, WindowEvent::Destroyed) {
        let settings_open = window.app_handle().get_webview_window("settings").is_some();
        let _ = apply_main_window_flags(window.app_handle(), settings_open);
      }
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
  fn onboarding_marker_survives_reload_and_handles_invalid_data() {
    let dir = std::env::temp_dir().join(format!("emerge-onboarding-{}", std::process::id()));
    let path = dir.join("onboarding.json");
    assert!(!super::onboarding_done_file(&path));
    super::save_onboarding_state(&path, false).unwrap();
    assert!(!super::onboarding_done_file(&path));
    super::save_onboarding_done(&path).unwrap();
    assert!(super::onboarding_done_file(&path));
    std::fs::write(&path, "{\"completed\":false}").unwrap();
    assert!(!super::onboarding_done_file(&path));
    std::fs::write(&path, "broken").unwrap();
    assert!(!super::onboarding_done_file(&path));
    let _ = std::fs::remove_dir_all(dir);
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
