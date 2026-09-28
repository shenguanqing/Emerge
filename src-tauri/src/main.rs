// 生命周期见 AGENTS.md 与 docs/ARCHITECTURE.md：桌面壳只负责窗口与原生能力，
// 生命体逻辑全部在前端 core 模块中。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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
    window.with_webview(move |webview| {
        unsafe {
            let wk = webview.inner() as *mut AnyObject;
            // 优先私有方法 _setDrawsBackground:，回退 KVC drawsBackground；
            // 两者都必须先 respondsToSelector，否则 ObjC 异常会直接 abort。
            let sel_private = objc2::sel!(_setDrawsBackground:);
            let resp: bool = msg_send![wk, respondsToSelector: sel_private];
            if resp {
                let _: () = msg_send![wk, _setDrawsBackground: false];
            } else {
                let key_c = std::ffi::CString::new("drawsBackground").unwrap();
                let key: *mut AnyObject =
                    msg_send![class!(NSString), stringWithUTF8String: key_c.as_ptr()];
                let _: () = msg_send![wk, setValue: false, forKey: key];
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").expect("main window missing");
            window.set_position(tauri::LogicalPosition::new(200.0, 200.0))?;
            #[cfg(target_os = "macos")]
            force_transparent_layers(&window);
            window.show()?;
            window.set_focus()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
