/**
 * 轻量 i18n：中文 / English / 日本語 / 한국어 四语词表，模块级单例，无依赖。
 * localeMode = 'auto' 跟随系统语言；选择持久化在 localStorage（与界面主题同一模式）。
 * t(key, vars) 做 {name} 插值；缺 key 时回落中文，再回落 key 本身。
 */
import { computed, ref, watch } from 'vue';
import translations from './messages.json';

export type Locale = 'zh' | 'en' | 'ja' | 'ko';
export type LocaleMode = 'auto' | Locale;

const STORAGE_KEY = 'emerge.ui.locale';

function detectLocale(): Locale {
  const lang = (navigator.language || '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('ko')) return 'ko';
  return 'en';
}

function readSavedMode(): LocaleMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en' || saved === 'ja' || saved === 'ko' || saved === 'auto') return saved;
  } catch { /* ignore */ }
  return 'auto';
}

const systemLocale = ref<Locale>(detectLocale());

export const localeMode = ref<LocaleMode>(readSavedMode());
export const locale = computed<Locale>(() =>
  localeMode.value === 'auto' ? systemLocale.value : localeMode.value,
);

// 同步 <html lang>：读屏与翻译工具依赖文档语言标记（非 DOM 环境如核心测试跳过）。
if (typeof document !== 'undefined') {
  window.addEventListener('languagechange', () => { systemLocale.value = detectLocale(); });
  watch(locale, (l) => { document.documentElement.lang = l === 'zh' ? 'zh-CN' : l; }, { immediate: true });
}

export function setLocaleMode(mode: LocaleMode): void {
  localeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

const messages: Record<Locale, Record<string, string>> = translations;
const zh = messages.zh;

/** 取当前语言文案；{name} 插值；缺 key 时回落中文，再回落 key。 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = messages[locale.value] ?? zh;
  let text = dict[key] ?? zh[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

const STAGE_LATIN: Record<string, string> = {
  origin: 'Origin',
  awaken: 'Awaken',
  conscious: 'Conscious',
  emerge: 'Emerge',
};

/** 四形态显示名：中/日/韩使用对应词条，英文保留 Origin 系列形态名。 */
export function stageDisplayName(id: string): string {
  const latin = STAGE_LATIN[id];
  if (!latin) return id;
  return locale.value === 'en' ? latin : t(`stage.${id}`);
}
