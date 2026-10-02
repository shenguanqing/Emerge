//! 全局指针跟踪：穿透时网页收不到事件，这里用 CGEvent 轮询位置与左键状态，
//! 与 DOM 路径同一套 ingest，保证滑动/点击反应一致。
//! 仅采集输入；窗口穿透状态由主线程统一设置。
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager};

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

unsafe extern "C" {
    fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
    fn CGEventSourceButtonState(state_id: u32, button: u32) -> bool;
    fn CFRelease(cf: *const std::ffi::c_void);
}

fn mouse_location() -> Option<(f64, f64)> {
    unsafe {
        let ev = CGEventCreate(std::ptr::null());
        if ev.is_null() {
            return None;
        }
        let p = CGEventGetLocation(ev);
        CFRelease(ev);
        Some((p.x, p.y))
    }
}

fn left_down() -> bool {
    // kCGEventSourceStateCombinedSessionState = 0, kCGMouseButtonLeft = 0
    unsafe { CGEventSourceButtonState(0, 0) }
}

/// 用户是否开启了鼠标穿透（托盘切换）。
static PASSTHROUGH: AtomicBool = AtomicBool::new(false);
pub fn set_passthrough(on: bool) {
    PASSTHROUGH.store(on, Ordering::SeqCst);
}

#[allow(dead_code)]
pub fn passthrough() -> bool {
    PASSTHROUGH.load(Ordering::SeqCst)
}

/// 每个窗口的物理几何必须使用它自己的缩放，不能借用主屏的 DPI。
fn logical_bounds(x: i32, y: i32, width: u32, height: u32, scale: f64) -> (f64, f64, f64, f64) {
    let scale = scale.max(1.0);
    (x as f64 / scale, y as f64 / scale, width as f64 / scale, height as f64 / scale)
}

/// 启动指针跟踪线程（应用生命周期内单例）。
pub fn spawn(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last = (f64::MIN, f64::MIN);
        let mut last_near = false;
        let mut last_btn = false;
        let mut bounds = None;
        let mut next_bounds = std::time::Instant::now();
        loop {
            let Some((mx, my)) = mouse_location() else {
                std::thread::sleep(Duration::from_millis(32));
                continue;
            };
            let Some(win) = app.get_webview_window("main") else {
                std::thread::sleep(Duration::from_millis(32));
                continue;
            };
            // 窗口查询涉及主线程，每秒最多四次，鼠标本身仍保持 60Hz 采集。
            if std::time::Instant::now() >= next_bounds {
                next_bounds = std::time::Instant::now() + Duration::from_millis(250);
                bounds = win.inner_position().ok().zip(win.inner_size().ok()).map(|(pos, size)| {
                    let scale = win.scale_factor().unwrap_or(1.0).max(1.0);
                    let settings_open = app.get_webview_window("settings")
                        .map(|settings| settings.is_visible().unwrap_or(true)).unwrap_or(false);
                    let welcome_bounds = app.get_webview_window("welcome")
                        .filter(|welcome| welcome.is_visible().unwrap_or(false))
                        .and_then(|welcome| {
                            let p = welcome.outer_position().ok()?;
                            let s = welcome.outer_size().ok()?;
                            let scale = welcome.scale_factor().ok()?;
                            Some(logical_bounds(p.x, p.y, s.width, s.height, scale))
                        });
                    (f64::from(pos.x) / scale, f64::from(pos.y) / scale,
                     f64::from(size.width) / scale, f64::from(size.height) / scale,
                     win.is_visible().unwrap_or(false) && !settings_open, welcome_bounds)
                });
            }
            if let Some((origin_x, origin_y, w, h, enabled, welcome_bounds)) = bounds {
                let x = mx - origin_x;
                let y = my - origin_y;
                let in_welcome = welcome_bounds.map(|(x, y, w, h)|
                    mx >= x && my >= y && mx < x + w && my < y + h).unwrap_or(false);
                let near = enabled && !in_welcome
                    && x >= 0.0 && y >= 0.0 && x < w && y < h;
                if near != last_near || (near && ((mx - last.0).abs() > 0.15 || (my - last.1).abs() > 0.15)) {
                    last_near = near;
                    last = (mx, my);
                    let _ = win.emit(
                        "global-pointer",
                        serde_json::json!({ "x": x, "y": y, "near": near, "kind": "move" }),
                    );
                }

                // 左键状态变化 → 与 DOM pointerdown/up 同一语义（按下含点击落点）。
                let btn = left_down() && near;
                if last_btn != btn {
                    last_btn = btn;
                    let _ = win.emit(
                        "global-pointer",
                        serde_json::json!({
                            "x": x,
                            "y": y,
                            "near": near,
                            "kind": if btn { "down" } else { "up" }
                        }),
                    );
                }
            }
            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::logical_bounds;

    #[test]
    fn welcome_bounds_use_their_own_monitor_scale() {
        // 主屏为 2× Retina，欢迎窗所在屏为 1×；排除区域不能缩成一半。
        assert_eq!(logical_bounds(1600, 100, 560, 640, 1.0), (1600., 100., 560., 640.));
        // 同一逻辑大小移回 Retina 后，使用欢迎窗更新后的 2× 缩放。
        assert_eq!(logical_bounds(200, 200, 1120, 1280, 2.0), (100., 100., 560., 640.));
        // 带负原点的外接显示器保留正确方向与大小。
        assert_eq!(logical_bounds(-560, 100, 560, 640, 1.0), (-560., 100., 560., 640.));
    }
}
