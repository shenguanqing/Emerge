//! 与 Vue 共用四语词表，原生层只保存语言选择与解析文案。
use std::sync::{atomic::{AtomicU8, Ordering}, OnceLock};
use serde_json::Value;

static UI_LOCALE: AtomicU8 = AtomicU8::new(0);
static MESSAGES: OnceLock<Value> = OnceLock::new();

fn messages() -> &'static Value {
    MESSAGES.get_or_init(|| serde_json::from_str(include_str!("../../src/i18n/messages.json")).expect("valid bundled translations"))
}
fn locale_id(locale: &str) -> u8 {
    match locale { "zh" => 0, "ja" => 2, "ko" => 3, _ => 1 }
}
pub fn set_locale(locale: &str) -> bool {
    let id = locale_id(locale);
    UI_LOCALE.swap(id, Ordering::SeqCst) != id
}
fn current_locale() -> &'static str {
    match UI_LOCALE.load(Ordering::SeqCst) { 0 => "zh", 2 => "ja", 3 => "ko", _ => "en" }
}
fn translate(locale: &str, key: &'static str) -> &'static str {
    let dict = messages();
    dict[locale][key].as_str().or_else(|| dict["en"][key].as_str()).unwrap_or(key)
}
pub fn tr(key: &'static str) -> &'static str { translate(current_locale(), key) }
pub fn stage_name(stage: &str) -> &'static str {
    match (current_locale(), stage) {
        ("en", "origin") => "Origin", ("en", "awaken") => "Awaken",
        ("en", "conscious") => "Conscious", ("en", "emerge") => "Emerge",
        (_, "origin") => tr("stage.origin"), (_, "awaken") => tr("stage.awaken"),
        (_, "conscious") => tr("stage.conscious"), (_, "emerge") => tr("stage.emerge"), _ => "—",
    }
}
pub fn format(key: &'static str, vars: &[(&str, &str)]) -> String {
    let mut text = tr(key).to_string();
    for (name, value) in vars { text = text.replace(&format!("{{{name}}}"), value); }
    text
}

/// Swift 只发送稳定错误代码和可选系统详情，避免把中文嵌进其它语言界面。
pub fn audio_error(raw: &str) -> String {
    let (key, detail) = raw.split_once('\t').unwrap_or((raw, ""));
    let key = match key {
        "error.audioPermission" => "error.audioPermission",
        "error.audioDenied" => "error.audioDenied",
        "error.audioNoDisplay" => "error.audioNoDisplay",
        "error.audioStart" => "error.audioStart",
        "error.audioStopped" => "error.audioStopped",
        "error.audioVersion" => "error.audioVersion",
        _ => "error.audioPermission",
    };
    format(key, &[("e", detail)])
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_locales_do_not_collapse_to_english() {
        assert_eq!([locale_id("zh"), locale_id("en"), locale_id("ja"), locale_id("ko")], [0, 1, 2, 3]);
        for locale in ["zh", "en", "ja", "ko"] {
            assert_eq!(messages()[locale].as_object().unwrap().len(), messages()["zh"].as_object().unwrap().len());
            assert_ne!(translate(locale, "native.settings"), "native.settings");
        }
        assert_eq!(translate("ja", "native.settings"), "設定");
        assert_eq!(translate("ko", "native.settings"), "설정");
    }
    #[test]
    fn native_keys_exist_in_all_four_locales() {
        for (key, _) in messages()["zh"].as_object().unwrap() {
            for locale in ["zh", "en", "ja", "ko"] {
                assert!(messages()[locale][key].as_str().is_some_and(|s| !s.is_empty()), "{locale}: {key}");
            }
        }
    }
}
