// 生命周期见 AGENTS.md 与 docs/ARCHITECTURE.md：桌面壳只负责窗口与原生能力，
// 生命体逻辑全部在前端 core 模块中。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem},
  tray::TrayIconBuilder,
  Manager,
};

/// 托盘菜单事件：显示/隐藏、置顶、鼠标穿透、退出。
/// 穿透开启时网页收不到任何鼠标事件，托盘是唯一恢复入口。
fn handle_tray_event(app: &tauri::AppHandle, id: &str) {
  let Some(win) = app.get_webview_window("main") else {
    return;
  };
  match id {
    "showhide" => {
      if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
      } else {
        let _ = win.show();
        let _ = win.set_focus();
      }
    }
    "topmost" => {
      let cur = win.is_always_on_top().unwrap_or(false);
      let _ = win.set_always_on_top(!cur);
      eprintln!("[tray] always_on_top -> {}", !cur);
    }
    "quit" => {
      app.exit(0);
    }
    _ => {}
  }
}

/// clearColor（NSColor），每次调用创建。
#[cfg(target_os = "macos")]
fn ns_color_clear() -> Option<*mut objc2::runtime::AnyObject> {
    use objc2::class;
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    unsafe {
        let color: *mut AnyObject = msg_send![class!(NSColor), clearColor];
        if color.is_null() { None } else { Some(color) }
    }
}

/// macOS：NSWindow 与 WKWebView 的不透明层必须显式关闭，
/// 否则 transparent 窗口仍显示黑色底板（wry 默认不覆盖全部路径）。
#[cfg(target_os = "macos")]
fn force_transparent_layers(window: &tauri::WebviewWindow) {
    use objc2::class;
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    unsafe {
        let ns_window = window.ns_window().expect("ns window") as *mut AnyObject;
        let _: () = msg_send![ns_window, setOpaque: false];
        let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![ns_window, setBackgroundColor: clear];

    }
    // WKWebView 实例上的私有属性 drawsBackground（KVC 设置）。
    // 注意必须作用于真正的 WKWebView，而非 wry 的容器视图。
    let wv = window.clone();
    let wv2 = window.clone();
    wv.with_webview(move |webview| {
        unsafe {
            let wk = webview.inner() as *mut AnyObject;
            // 1) 私有方法 _setDrawsBackground:（respondsToSelector 守卫）
            let sel_private = objc2::sel!(_setDrawsBackground:);
            let resp: bool = msg_send![wk, respondsToSelector: sel_private];
            if resp {
                let _: () = msg_send![wk, _setDrawsBackground: false];
            }
            // 2) webview 自身不透明层
            let _: () = msg_send![wk, setOpaque: false];
            // 3) underPageBackgroundColor = clear（macOS 12+，页底透出色）
            if let Some(color) = ns_color_clear() {
                let _: () = msg_send![wk, setUnderPageBackgroundColor: color];
            }
            // 4) 再次确认 NSWindow 层（setup 阶段已设，此处兜底）
            if let Some(ns_window) = wv2.ns_window().ok() {
                let win = ns_window as *mut AnyObject;
                let _: () = msg_send![win, setOpaque: false];
                if let Some(color) = ns_color_clear() {
                    let _: () = msg_send![win, setBackgroundColor: color];
                }
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window missing");
            // 位置/尺寸由 window-state 插件跨启动恢复；首_run 使用配置默认值。
            #[cfg(target_os = "macos")]
            force_transparent_layers(&window);

            // 系统托盘：桌宠的唯一常驻交互入口（穿透开启时网页收不到事件）。
            let showhide = MenuItem::with_id(app, "showhide", "显示 / 隐藏", true, None::<&str>)?;
            let topmost = CheckMenuItem::with_id(app, "topmost", "置顶", true, true, None::<&str>)?;
            let clickthrough =
                CheckMenuItem::with_id(app, "clickthrough", "鼠标穿透", true, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Emerge", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&showhide, &topmost, &clickthrough, &quit])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("default icon").clone())
                .tooltip("Emerge · Particle Life")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .build(app)?;

            // 菜单勾选状态与窗口实际状态同步。
            // 穿透状态无查询 API，用原子布尔跟踪（菜单事件可能在不同线程触发）。
            let ignore_cursor = std::sync::atomic::AtomicBool::new(false);
            let topmost_ref = topmost.clone();
            let clickthrough_ref = clickthrough.clone();
            app.on_menu_event(move |app, event| {
                let Some(win) = app.get_webview_window("main") else {
                    return;
                };
                match event.id().as_ref() {
                    "topmost" => {
                        let cur = win.is_always_on_top().unwrap_or(false);
                        let _ = win.set_always_on_top(!cur);
                        let _ = topmost_ref.set_checked(!cur);
                        eprintln!("[tray] always_on_top -> {}", !cur);
                    }
                    "clickthrough" => {
                        use std::sync::atomic::Ordering;
                        let next = !ignore_cursor.load(Ordering::SeqCst);
                        ignore_cursor.store(next, Ordering::SeqCst);
                        let _ = win.set_ignore_cursor_events(next);
                        let _ = clickthrough_ref.set_checked(next);
                        eprintln!("[tray] ignore_cursor_events -> {}", next);
                    }
                    _ => handle_tray_event(app, event.id().as_ref()),
                }
            });

            window.show()?;
            window.set_focus()?;

            // API 自检：穿透/置顶调用路径可用（对最终状态无净影响）。
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_ignore_cursor_events(false);
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_top(true);
            eprintln!("[selftest] tray window api ok");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
