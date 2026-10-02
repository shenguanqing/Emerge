import { computed, onBeforeUnmount, ref } from 'vue';
import { resolveColors, type VisualSettings } from '../core/settings';

/** 控件保留生命体主体原色；仅强调文字独立调整可读性。 */
export function usePaletteAccent(settings: VisualSettings, themeMode: () => string) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(query.matches);
  const update = () => { systemDark.value = query.matches; };
  query.addEventListener('change', update);
  onBeforeUnmount(() => query.removeEventListener('change', update));

  return computed(() => {
    const dark = themeMode() === 'dark' || (themeMode() !== 'light' && systemDark.value);
    const rgb = resolveColors(settings).body;
    let textRgb = [...rgb];
    const luminance = (color: number[]) => color.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    // 强调文字适配纸色/深灰背景，不改变滑块、选中态和按钮底色。
    for (let i = 0; i < 100 && (dark ? luminance(textRgb) < 0.5 : luminance(textRgb) > 0.13); i++) {
      textRgb = textRgb.map(c => dark ? c + (1 - c) * 0.04 : c * 0.96);
    }
    const channels = rgb.map(c => Math.round(c * 255)).join(', ');
    const accent = `rgb(${channels})`;
    return {
      '--accent': accent,
      '--accent-text': `rgb(${textRgb.map(c => Math.round(c * 255)).join(', ')})`,
      '--accent-hover': accent,
      '--accent-soft': `rgba(${channels}, ${dark ? 0.16 : 0.10})`,
      '--btn-solid': accent,
      '--btn-solid-ink': luminance(rgb) > 0.179 ? '#141413' : '#ffffff',
    };
  });
}
