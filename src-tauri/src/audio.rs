use std::sync::Mutex;
use serde::Serialize;

#[derive(Clone, Copy, Serialize)]
pub struct AudioReading { bass: f64, mid: f64, treble: f64, status: i32,
    #[serde(skip)] updated_at: Option<std::time::Instant> }
static ERROR: Mutex<String> = Mutex::new(String::new());
static READING: Mutex<AudioReading> = Mutex::new(AudioReading { bass: 0., mid: 0., treble: 0., status: 0, updated_at: None });
#[cfg(target_os = "macos")]
extern "C" {
    fn emerge_audio_start(callback: extern "C" fn(f64, f64, f64, i32), failure: extern "C" fn(*const std::ffi::c_char));
    fn emerge_audio_stop();
    fn emerge_now_playing(buf: *mut std::ffi::c_char, cap: usize) -> i32;
}
#[cfg(target_os = "macos")]
extern "C" fn receive(bass: f64, mid: f64, treble: f64, status: i32) {
    if let Ok(mut reading) = READING.lock() {
        if reading.status != 0 { *reading = AudioReading { bass, mid, treble, status, updated_at: Some(std::time::Instant::now()) }; }
    }
}
#[cfg(target_os = "macos")]
extern "C" fn failure(message: *const std::ffi::c_char) {
    if message.is_null() { return; }
    if let Ok(mut error) = ERROR.lock() { *error = unsafe { std::ffi::CStr::from_ptr(message) }.to_string_lossy().into_owned(); }
}
#[tauri::command]
pub fn system_audio_start() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut reading = READING.lock().map_err(|e| e.to_string())?;
        if reading.status != 0 { return Err("请先停止当前系统音频监听".into()); }
        reading.status = 2;
        if let Ok(mut error) = ERROR.lock() { error.clear(); }
        unsafe { emerge_audio_start(receive, failure); }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    Err("当前平台尚未实现系统音频捕获，请选择音乐文件".into())
}
#[tauri::command]
pub fn system_audio_stop() {
    if let Ok(mut reading) = READING.lock() { reading.status = 0; }
    #[cfg(target_os = "macos")]
    unsafe { emerge_audio_stop(); }
}

/// 是否正在捕获（启动中或采样中）；错误态不计入。
#[allow(dead_code)]
pub fn is_capturing() -> bool {
    matches!(READING.lock().map(|r| r.status).unwrap_or(0), 1 | 2)
}
#[tauri::command]
pub fn system_audio_read(app: tauri::AppHandle) -> Result<AudioReading, String> {
    let mut reading = READING.lock().map(|r| *r).map_err(|e| e.to_string())?;
    if reading.status < 0 {
        let message = ERROR.lock().map_err(|e| e.to_string())?.clone();
        // 原生层已写好可操作的中文原因，这里直接透传，不再二次包装。
        super::update_audio_info(&app, &format!("{}{}", super::l("系统声音：", "System audio: "), if message.is_empty() { super::l("捕获失败，请检查权限", "capture failed — check permissions") } else { &message }), true);
        return Err(if message.is_empty() {
            "无法监听系统声音。请在 系统设置 → 隐私与安全性 → 屏幕与系统音频录制 中允许 Emerge 后重试。".into()
        } else {
            message
        });
    }
    // 捕获停止发送样本时不能把最后一帧声音无限计为音乐成长。
    if reading.updated_at.map_or(true, |at| at.elapsed().as_millis() > 500) {
        reading.bass = 0.; reading.mid = 0.; reading.treble = 0.;
    }
    let label = match reading.status {
        1 => {
            let energy = (reading.bass * 0.4 + reading.mid * 0.4 + reading.treble * 0.2) * 100.;
            if energy < 1. { super::l("系统声音：已连接，等待声音", "System audio: connected, waiting for sound").to_string() }
            else { format!("{} · {} {:.0}%", super::l("系统声音：正在接收", "System audio: receiving"), super::l("能量", "energy"), energy) }
        },
        2 => super::l("系统声音：正在启动…", "System audio: starting…").to_string(),
        _ => super::l("系统声音：未开启", "System audio: off").to_string(),
    };
    super::update_audio_info(&app, &label, false);
    Ok(reading)
}

/// 打开 macOS「屏幕与系统音频录制」设置页，方便用户授权后重试。
#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("无法打开系统设置：{e}"))
    }
    #[cfg(not(target_os = "macos"))]
    Err("当前平台无需该设置项".into())
}

/// 系统「正在播放」曲名；取不到返回空字符串。
#[tauri::command]
pub fn system_now_playing() -> String {
    #[cfg(target_os = "macos")]
    {
        let mut buf = [0i8; 256];
        let n = unsafe { emerge_now_playing(buf.as_mut_ptr(), buf.len()) };
        if n <= 0 {
            return String::new();
        }
        let bytes: Vec<u8> = buf[..n as usize].iter().map(|&c| c as u8).collect();
        return String::from_utf8_lossy(&bytes).into_owned();
    }
    #[cfg(not(target_os = "macos"))]
    String::new()
}
