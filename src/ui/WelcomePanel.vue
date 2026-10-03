<script setup lang="ts">
import { usePaletteAccent } from './usePaletteAccent';
import { useSettingsSync } from './useSettingsSync';
/**
 * 首次引导（独立窗口，?window=welcome；preview=1 时为浏览器预览，不落盘、不发原生事件）。
 * 认识 → 摆放 → 可选音乐。
 * 顶部常驻「粒子球」舞台：调整大小与配色时实时预览；下方内容区与设置页（SettingsPanel）共用设计令牌。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  COLOR_THEMES,
  loadSettings,
  normalizePosition,
  resolveColors,
  patchSettings,
  type ColorTheme,
} from '../core/settings';
import { defaultStorage } from '../core/LifeStorage';
import { saveOnboardingState } from '../core/onboarding';
import { setLocaleMode, t, type LocaleMode } from '../i18n';
import { emitLocal, emitNative, invoke, isDesktop, listenLocal, listenNative } from '../platform/desktop';

/**
 * embedded：主应用内嵌覆盖层（Web 端首次引导），完成动作交给宿主切换界面。
 * 独立窗口/直链模式行为不变：桌面走 complete_onboarding，Web 直链跳设置页。
 */
const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ finish: [] }>();

const step = ref(0);
const title = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
/** 界面主题：auto 跟随系统；Web 端无存储时默认深色（与主画面一致），桌面保持 auto。 */
type ThemeMode = 'auto' | 'light' | 'dark';
function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem('emerge.ui.theme');
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return isDesktop ? 'auto' : 'dark';
}
const themeMode: ThemeMode = readStoredTheme();
const settings = reactive(loadSettings());
const preview = new URLSearchParams(location.search).get('preview') === '1';
useSettingsSync((patch) => Object.assign(settings, patch), !preview);
const busy = ref(false);
const error = ref('');
const systemStatus = ref<'off' | 'starting' | 'listening'>('off');
/** 系统监听成功后轮询到的「正在播放」曲名；取不到保持空，状态行退回普通提示。 */
const nowPlaying = ref('');
let lastNowPlayingAt = 0;
let pollTimer = 0;
let disposed = false;
let systemRevision = 0;
const headings = computed(() => [t('welcome.meet'), t('welcome.place'), t('welcome.listen')]);

/** 外观改动即时落盘并通知主窗：跨窗走原生事件，同页覆盖层走本地事件桥。 */
async function applyAppearance(key: 'bodyScale' | 'theme' | 'hue'): Promise<void> {
  if (preview) return;
  try {
    const patch = { [key]: settings[key] };
    Object.assign(settings, patchSettings(patch));
    emitLocal('app-settings-changed', patch);
    emitLocal('visual-settings', { ...settings, colors: resolveColors(settings) });
    if (!isDesktop) return;
    await emitNative('app-settings-changed', patch);
    await emitNative('visual-settings', { ...settings, colors: resolveColors(settings) });
  } catch (e) { error.value = t('welcome.errorSave', { e: String(e) }); }
}

/** 摆放图与设置页同一套交互：拖动 / 点按 / 方向键微调，改动即保存并通知主窗。 */
/** 摆放预览按宿主显示区域比例：桌面为整块屏幕，Web 为浏览器视口。 */
const screenWidth = isDesktop ? (window.screen?.width ?? 16) : (window.innerWidth || 16);
const screenHeight = isDesktop ? (window.screen?.height ?? 10) : (window.innerHeight || 10);
const placing = ref(false);
async function applyPosition(): Promise<void> {
  if (preview) return;
  try {
    const patch = { positionX: settings.positionX, positionY: settings.positionY };
    Object.assign(settings, patchSettings(patch));
    emitLocal('app-settings-changed', patch);
    emitLocal('desktop-position', { x: settings.positionX, y: settings.positionY });
    if (!isDesktop) return;
    await emitNative('app-settings-changed', patch);
    await emitNative('desktop-position', { x: settings.positionX, y: settings.positionY });
  } catch (e) { error.value = t('welcome.errorSave', { e: String(e) }); }
}
function movePlacement(event: PointerEvent): void {
  if (!placing.value) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  settings.positionX = normalizePosition((event.clientX - box.left) / box.width);
  settings.positionY = normalizePosition((event.clientY - box.top) / box.height);
  void applyPosition();
}
function startPlacement(event: PointerEvent): void {
  if (event.button !== 0) return;
  placing.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  movePlacement(event);
}
function keyPlacement(event: KeyboardEvent): void {
  const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  settings.positionX = normalizePosition(settings.positionX + direction[0] * 0.01);
  settings.positionY = normalizePosition(settings.positionY + direction[1] * 0.01);
  void applyPosition();
}

/** 滑条读数与填充比例：与设置页一致，数值只读、只靠拖动调整。 */
const bodyScalePct = computed(() => Math.round(settings.bodyScale * 100));
function sliderFill(value: number, min: number, max: number): Record<string, string> {
  const pct = ((value - min) / (max - min)) * 100;
  return { '--fill': `${pct}%` };
}

function swatchColor(body: [number, number, number]): string {
  return `rgb(${body.map((c) => Math.round(c * 255)).join(',')})`;
}

/** 色点用「核白→主体→深晕」径向渐变预览，贴近粒子实际加法发光的观感。 */
function swatchStyle(theme: ColorTheme): Record<string, string> {
  return {
    background: `radial-gradient(circle at 50% 44%, ${swatchColor(theme.core)} 0%, ${swatchColor(theme.body)} 46%, ${swatchColor(theme.aura)} 100%)`,
  };
}
const themeName = computed(() =>
  settings.theme === 'custom' ? t('palette.custom') : t(`theme.${settings.theme}`),
);

/* ===== 舞台粒子球：随体型、配色实时变化的小型预览 ===== */
type Rgb = [number, number, number];
const orbCanvas = ref<HTMLCanvasElement | null>(null);
const ORB_SIZE = 112;
let orbRaf = 0;
let orbScale = settings.bodyScale;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 每个粒子在单位球内取点，r 越小越靠近核心；核心粒子转得更快。 */
const ORB_PARTICLES = Array.from({ length: 280 }, () => {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const r = Math.pow(Math.random(), 0.55);
  const s = Math.sqrt(1 - u * u);
  return {
    x: s * Math.cos(a) * r,
    y: u * r,
    z: s * Math.sin(a) * r,
    r,
    size: 0.7 + Math.random() * 1.3,
    speed: 0.15 + (1 - r) * 0.35 + Math.random() * 0.1,
    spin: Math.random() * 2 - 1,
  };
});

/** 色板缓存：resolveColors 只依赖主题与色相，避免动画每帧重算与分配。 */
let paletteCache: { key: string; colors: { core: Rgb; body: Rgb; aura: Rgb } } | null = null;
function orbPalette(): { core: Rgb; body: Rgb; aura: Rgb } {
  const key = `${settings.theme}:${settings.hue}`;
  if (!paletteCache || paletteCache.key !== key) {
    paletteCache = { key, colors: resolveColors(settings) };
  }
  return paletteCache.colors;
}
function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
function isDark(): boolean {
  return themeMode === 'dark' || (themeMode !== 'light' && !!darkQuery?.matches);
}
/** 舞台光晕取当前主体色，与页面底色混合，随配色变化而不是固定深色块。 */
const stageStyle = computed(() => ({ '--glow': swatchColor(orbPalette().body) }));

/* ===== 观察空间演示：双击粒子球，球体放大散开一下，作为「双击进入观察空间」的预演 ===== */
const peeked = ref(false);
/** 双击脉冲的 performance.now() 起点；0 表示无脉冲。 */
const orbPeek = ref(0);
function peekObservatory(): void {
  if (step.value !== 0) return;
  peeked.value = true;
  if (!reducedMotion && orbPeek.value === 0) orbPeek.value = performance.now();
}

function startOrb(): void {
  const canvas = orbCanvas.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = ORB_SIZE * dpr;
  canvas.height = ORB_SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const half = ORB_SIZE / 2;
  const tilt = 0.35;
  let time = 0;
  let last = performance.now();

  const frame = (now: number): void => {
    orbRaf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reducedMotion) time += dt;
    // 双击脉冲：0→1→0 包络，球体放大散开再收回；演示「双击进入观察空间」。
    let pulse = 0;
    if (orbPeek.value > 0) {
      const t = (now - orbPeek.value) / 900;
      if (t >= 1) orbPeek.value = 0;
      else pulse = Math.sin(Math.PI * t);
    }
    // 体型变化平滑过渡，拖滑条时球体是「长大」而不是跳变。
    orbScale += (settings.bodyScale - orbScale) * 0.1;
    const breathe = reducedMotion ? 1 : 1 + 0.03 * Math.sin(time * 1.4);
    const R = (18 + orbScale * 30) * breathe * (1 + 0.85 * pulse);
    const { core, body, aura } = orbPalette();

    const dark = isDark();
    ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);
    // 深色底用加法发光；浅色底加法会被洗白，改用普通叠加 + 加深的颜色。
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';

    const glow = ctx.createRadialGradient(half, half, 0, half, half, half);
    glow.addColorStop(0, `rgba(${body.map((c) => Math.round(c * 255)).join(',')},${dark ? 0.28 : 0.16})`);
    glow.addColorStop(1, `rgba(${body.map((c) => Math.round(c * 255)).join(',')},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, ORB_SIZE, ORB_SIZE);

    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    for (const p of ORB_PARTICLES) {
      const ang = time * p.speed + pulse * p.spin * 2.2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const x1 = p.x * cosA - p.z * sinA;
      const z1 = p.x * sinA + p.z * cosA;
      const y2 = p.y * cosT - z1 * sinT;
      const z2 = p.y * sinT + z1 * cosT;
      const depth = 0.8 + 0.25 * z2; // 近大远小
      let c: Rgb;
      let alpha: number;
      if (dark) {
        c = p.r < 0.5 ? mix(core, body, p.r / 0.5) : mix(body, aura, (p.r - 0.5) / 0.5);
        alpha = (0.3 + 0.5 * (1 - p.r * 0.6)) * (0.55 + 0.45 * depth);
      } else {
        // 浅色：核白在浅底上看不见，从主体色出发向深晕过渡并整体压暗。
        const m = mix(body, aura, p.r * 0.7);
        c = [m[0] * 0.82, m[1] * 0.82, m[2] * 0.82];
        alpha = (0.45 + 0.4 * (1 - p.r * 0.5)) * (0.6 + 0.4 * depth);
      }
      ctx.fillStyle = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(half + x1 * R * depth, half + y2 * R * depth, p.size * depth, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  orbRaf = requestAnimationFrame(frame);
}

function schedulePoll(): void {
  clearTimeout(pollTimer);
  if (disposed || step.value !== 2 || !isDesktop || preview) return;
  pollTimer = window.setTimeout(async () => {
    if (busy.value) { schedulePoll(); return; }
    const revision = systemRevision;
    try {
      const reading = await invoke<{ status: number }>('system_audio_read');
      if (disposed || revision !== systemRevision) return;
      systemStatus.value = reading.status === 1 ? 'listening' : reading.status === 2 ? 'starting' : 'off';
      if (reading.status === 1) {
        // 曲名查询限频 3 秒（与主窗托盘一致）；取不到就保持「正在监听系统声音」。
        const now = Date.now();
        if (now - lastNowPlayingAt > 3000) {
          lastNowPlayingAt = now;
          try {
            const name = await invoke<string>('system_now_playing');
            if (!disposed && revision === systemRevision) nowPlaying.value = name.trim();
          } catch { /* 曲名不可用，忽略 */ }
        }
      } else {
        nowPlaying.value = '';
      }
    } catch (e) {
      if (!disposed && revision === systemRevision) { systemStatus.value = 'off'; error.value = String(e); }
    }
    schedulePoll();
  }, 500);
}

watch(step, async () => {
  error.value = '';
  schedulePoll();
  await nextTick();
  // 过渡期间滚动位置随节点重建自动回顶；结束后聚焦新标题（读屏跟随）。
  window.setTimeout(() => { title.value?.focus(); }, 220);
});

async function toggleSystem(): Promise<void> {
  busy.value = true;
  error.value = '';
  clearTimeout(pollTimer);
  systemRevision++;
  const enabled = systemStatus.value === 'off';
  try {
    await invoke('set_system_audio_enabled', { enabled });
    systemStatus.value = enabled ? 'starting' : 'off';
    if (enabled) { lastNowPlayingAt = 0; nowPlaying.value = ''; schedulePoll(); }
    else nowPlaying.value = '';
  } catch (e) { error.value = String(e); }
  finally { busy.value = false; schedulePoll(); }
}

async function pickMusic(): Promise<void> {
  busy.value = true;
  error.value = '';
  try { await invoke('onboarding_pick_music'); }
  catch (e) { error.value = t('welcome.errorMusic', { e: String(e) }); }
  finally { busy.value = false; }
}

/** 主应用内嵌时复用 MusicControl 的共享音频实例：引导页选中的文件音乐直接驱动生命体。 */
interface SharedAudio {
  attachFile(file: File): Promise<void>;
  detach(): void;
}
function sharedAudio(): SharedAudio | null {
  return (window as typeof window & { __emergeAudio?: SharedAudio }).__emergeAudio ?? null;
}
/** Web 内嵌引导：本地文件音乐入口可用（独立直链页没有共享音频实例，保持禁用）。 */
const webMusicEnabled = !isDesktop && props.embedded && sharedAudio() !== null;
const webFileInput = ref<HTMLInputElement | null>(null);
/** 「正在听」行：桌面选曲经 music-state 事件回流，网页选择后由共享实例同步。 */
const webMusicName = ref('');
const webMusicBusy = ref(false);

function onPickMusic(): void {
  if (isDesktop) void pickMusic();
  else webFileInput.value?.click();
}

async function onWebMusicFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const audio = sharedAudio();
  if (!file || !audio) return;
  webMusicBusy.value = true;
  error.value = '';
  try {
    await audio.attachFile(file);
  } catch (e) { error.value = t('welcome.errorMusic', { e: String(e) }); }
  finally { webMusicBusy.value = false; }
}

function stopGuideMusic(): void {
  if (isDesktop) { void invoke('stop_music').catch((e) => { error.value = String(e); }); return; }
  sharedAudio()?.detach();
}

const unlistensMusic: Array<() => void> = [];
let disposedMusic = false;
onMounted(() => {
  const receiveMusic = (p: { name: string; playing: boolean }): void => {
    if (!disposedMusic) webMusicName.value = p.name;
  };
  void listenNative<{ name: string; playing: boolean }>('music-state', receiveMusic).then((un) => {
    if (disposedMusic) un(); else unlistensMusic.push(un);
  });
  unlistensMusic.push(listenLocal<{ name: string; playing: boolean }>('music-state', receiveMusic));
});

async function finish(): Promise<void> {
  busy.value = true;
  error.value = '';
  if (props.embedded) {
    // 标记逻辑与桌面 complete_onboarding 同位：完成动作本身负责落盘，宿主只关覆盖层。
    if (!preview) saveOnboardingState(defaultStorage(), true);
    emit('finish');
    return;
  }
  try {
    if (isDesktop) await invoke('complete_onboarding');
    else {
      // Web 直链模式没有 Rust 命令，完成标记与桌面 onboarding.json 同语义落盘；完成后回主页面。
      if (!preview) saveOnboardingState(defaultStorage(), true);
      location.href = location.origin + location.pathname;
    }
  } catch (e) { error.value = t('welcome.errorFinish', { e: String(e) }); busy.value = false; }
}

let unlistenLocale: (() => void) | undefined;
onMounted(() => {
  startOrb();
  void listenNative<LocaleMode>('ui-locale-changed', (mode) => {
    if (!disposed) setLocaleMode(mode);
  }).then((remove) => { if (disposed) remove(); else unlistenLocale = remove; });
});
onBeforeUnmount(() => {
  disposed = true;
  disposedMusic = true;
  for (const un of unlistensMusic) un();
  unlistenLocale?.();
  clearTimeout(pollTimer);
  cancelAnimationFrame(orbRaf);
});
const accentStyle = usePaletteAccent(settings, () => themeMode);
</script>

<template>
  <main class="welcome" :class="{ dark: themeMode === 'dark', light: themeMode === 'light' }" :style="accentStyle">
    <header class="stage" :style="stageStyle">
      <button v-if="step < 2" type="button" class="skip" :disabled="busy" @click="finish">{{ t('welcome.skip') }}</button>
      <canvas ref="orbCanvas" class="orb" :style="{ width: `${ORB_SIZE}px`, height: `${ORB_SIZE}px` }" aria-hidden="true" @dblclick="peekObservatory" />
      <p class="brand">Emerge</p>
      <ol class="dots" :aria-label="t('welcome.progress')">
        <li
          v-for="(heading, i) in headings"
          :key="i"
          :class="{ current: step === i, done: step > i }"
          :aria-current="step === i ? 'step' : undefined"
        ><span class="sr-only">{{ heading }}</span></li>
      </ol>
      <button v-if="step === 0" type="button" class="peek-hint" aria-live="polite" @click="peekObservatory">{{ peeked ? t(isDesktop ? 'welcome.peekDone' : 'welcome.peekDoneWeb') : t('welcome.peekTry') }}</button>
    </header>

    <Transition name="step-fade" mode="out-in">
      <section ref="contentEl" class="content" :key="step">
      <div class="column">
        <template v-if="step === 0">
          <h1 ref="title" tabindex="-1">{{ t('welcome.meetTitle') }}</h1>
          <p class="intro">{{ t(isDesktop ? 'welcome.meetIntro' : 'welcome.meetIntroWeb') }}</p>
          <ul class="lessons card">
            <li><span class="lesson-dot" aria-hidden="true" /><div class="lesson-copy"><strong>{{ t('welcome.slow') }}</strong><p>{{ t('welcome.slowDesc') }}</p></div></li>
            <li><span class="lesson-dot" aria-hidden="true" /><div class="lesson-copy"><strong>{{ t('welcome.tap') }}</strong><p>{{ t('welcome.tapDesc') }}</p></div></li>
            <li><span class="lesson-dot" aria-hidden="true" /><div class="lesson-copy"><strong>{{ t('welcome.observe') }}</strong><p>{{ t('welcome.observeDesc') }}</p></div></li>
          </ul>
          <p class="note">{{ t(isDesktop ? 'welcome.trayHint' : 'welcome.webHint') }}</p>
        </template>

        <template v-else-if="step === 1">
          <h1 ref="title" tabindex="-1">{{ t('welcome.placeTitle') }}</h1>
          <p class="intro">{{ t('welcome.placeIntro') }}</p>
          <div class="card">
            <div class="field">
              <div class="label-row">
                <label for="welcome-size">{{ t('appearance.bodySize') }}</label>
                <strong class="value-text">{{ bodyScalePct }}%</strong>
              </div>
              <input id="welcome-size" v-model.number="settings.bodyScale" class="slider" type="range" min="0.1" max="1" step="0.01" :style="sliderFill(settings.bodyScale, 0.1, 1)" @input="applyAppearance('bodyScale')" />
            </div>
            <div class="field">
              <div class="label-row">
                <span id="welcome-palette-label">{{ t('appearance.palette') }}</span>
                <span class="value-text">{{ themeName }}</span>
              </div>
              <div class="swatches" role="group" aria-labelledby="welcome-palette-label">
                <button
                  v-for="theme in COLOR_THEMES"
                  :key="theme.id"
                  type="button"
                  class="swatch"
                  :class="{ on: settings.theme === theme.id }"
                  :title="t(`theme.${theme.id}`)"
                  :aria-label="t(`theme.${theme.id}`)"
                  :aria-pressed="settings.theme === theme.id"
                  :style="swatchStyle(theme)"
                  @click="settings.theme = theme.id; applyAppearance('theme')"
                />
                <button
                  type="button"
                  class="swatch custom"
                  :class="{ on: settings.theme === 'custom' }"
                  :title="t('palette.custom')"
                  :aria-label="t('palette.custom')"
                  :aria-pressed="settings.theme === 'custom'"
                  @click="settings.theme = 'custom'; applyAppearance('theme')"
                >
                  <span class="hue-dot" />
                </button>
              </div>
            </div>
            <div v-if="settings.theme === 'custom'" class="field">
              <div class="label-row">
                <label for="welcome-hue">{{ t('appearance.hue') }}</label>
                <strong class="value-text">{{ Math.round(settings.hue) }}°</strong>
              </div>
              <input id="welcome-hue" v-model.number="settings.hue" class="slider hue" type="range" min="0" max="360" step="1" @input="applyAppearance('hue')" />
            </div>
          </div>
          <div class="card">
            <div
              class="placement-map"
              tabindex="0"
              role="group"
              :aria-label="t('section.position')"
              :style="{ aspectRatio: `${screenWidth} / ${screenHeight}`, width: '100%' }"
              @pointerdown="startPlacement" @pointermove="movePlacement"
              @pointerup="placing = false" @pointercancel="placing = false" @lostpointercapture="placing = false"
              @keydown="keyPlacement"
            >
              <span class="screen-label">{{ t('position.desktop') }}</span>
              <span class="placement-marker" :style="{ left: `${settings.positionX * 100}%`, top: `${settings.positionY * 100}%` }">✦</span>
            </div>
            <div class="placement-meta">
              <p class="note plain">{{ t('position.hint') }}</p>
              <p class="coord" aria-live="polite">{{ Math.round(settings.positionX * 100) }}% · {{ Math.round(settings.positionY * 100) }}%</p>
            </div>
            <p v-if="isDesktop" class="note card-note">{{ t('welcome.passthrough') }}</p>
          </div>
        </template>

        <template v-else>
          <h1 ref="title" tabindex="-1">{{ t('welcome.listenTitle') }}</h1>
          <p class="intro">{{ t('welcome.listenIntro') }}</p>
          <div class="options">
            <button
              type="button"
              class="option"
              :class="{ solo: !isDesktop }"
              :disabled="busy || webMusicBusy || preview || (isDesktop && systemStatus !== 'off') || (!isDesktop && !webMusicEnabled)"
              @click="onPickMusic"
            >
              <svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg>
              <span>{{ t('music.select') }}</span>
            </button>
            <button v-if="isDesktop" type="button" class="option" :class="{ on: systemStatus !== 'off' }" :disabled="busy || preview" :aria-pressed="systemStatus !== 'off'" @click="toggleSystem">
              <svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>
              <span>{{ t(systemStatus === 'off' ? 'music.listen' : 'music.stopSystem') }}</span>
            </button>
          </div>
          <input v-if="!isDesktop" ref="webFileInput" class="web-music-file" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.aiff,.aif" :aria-label="t('music.select')" @change="onWebMusicFile" />
          <div v-if="webMusicName" class="music-now-row">
            <p role="status" class="note now-playing">{{ t('music.nowPlaying', { song: webMusicName }) }}</p>
            <button type="button" class="btn-text" :disabled="webMusicBusy" @click="stopGuideMusic">{{ t('music.stop') }}</button>
          </div>
          <p v-if="systemStatus !== 'off'" role="status" class="note" :class="{ 'now-playing': !!nowPlaying }">
            {{ nowPlaying ? t('music.nowPlaying', { song: nowPlaying }) : t(systemStatus === 'starting' ? 'music.starting' : 'music.system') }}
          </p>
          <details class="permission card"><summary>{{ t('welcome.permissionTitle') }}</summary><p class="note plain">{{ t('welcome.permission') }}</p></details>
          <p class="note">{{ t('welcome.skipMusic') }}</p>
          <p v-if="!isDesktop || preview" class="note">{{ t(isDesktop ? 'welcome.desktopOnly' : 'welcome.musicWeb') }}</p>
        </template>

        <p v-if="error" role="alert" class="error">{{ error }}</p>
      </div>
    </section>
    </Transition>

    <footer>
      <div class="footer-inner">
        <button v-if="step > 0" type="button" class="btn-text" :disabled="busy" @click="step--">{{ t('welcome.back') }}</button>
        <button type="button" class="primary" :disabled="busy" @click="step < 2 ? step++ : finish()">{{ t(step < 2 ? 'welcome.next' : 'welcome.finish') }}</button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
/* ===== Design Tokens：与设置页（SettingsPanel .page）一致 ===== */
.welcome {
  --bg-page: #faf9f5;
  --bg-surface: #ffffff;
  --bg-sunken: #f0eee6;
  --text-primary: #141413;
  --text-secondary: #5e5d59;
  --text-tertiary: #87867f;
  --border-subtle: #e8e6dc;
  --border-strong: #d1cfc5;
  --accent: #d97757;
  --accent-text: #a85e43;
  --accent-soft: rgba(217, 119, 87, 0.12);
  --btn-solid: #a85e43;
  --btn-solid-ink: #ffffff;
  --danger: #b53333;
  --knob: #ffffff;
  --radius-md: 10px;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --font-ui: system-ui, -apple-system, 'PingFang SC', 'Noto Sans SC', 'Segoe UI', sans-serif;

  box-sizing: border-box;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  color: var(--text-primary);
  font: 14px/20px var(--font-ui);
  -webkit-font-smoothing: antialiased;
}
.welcome :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.welcome :focus:not(:focus-visible) {
  outline: none;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ===== 舞台：深色底 + 粒子球，是整页唯一的视觉重点 ===== */
.stage {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
  padding: 12px 24px 10px;
  /* 上层：底部线性渐隐到页面底色（保证下边缘完全融入）；下层：球体周围的主体色光晕。 */
  background-color: var(--bg-page);
  background-image:
    linear-gradient(to bottom, transparent 55%, var(--bg-page) 100%),
    radial-gradient(
      ellipse 75% 85% at 50% 38%,
      color-mix(in srgb, var(--glow, #c4a574) 22%, var(--bg-page)) 0%,
      var(--bg-page) 100%
    );
  color: var(--text-primary);
}
.orb {
  display: block;
}
.brand {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}
.dots {
  display: flex;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.dots li {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--border-strong);
  transition:
    width 0.2s var(--ease),
    background 0.2s var(--ease);
}
.dots li.done {
  background: var(--text-tertiary);
}
.dots li.current {
  width: 22px;
  background: var(--accent);
}
.peek-hint {
  margin: 10px 0 0;
  min-height: 22px;
  padding: 2px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font: 12px/18px var(--font-ui);
  text-align: center;
  color: var(--accent-text);
  cursor: pointer;
  transition:
    color 0.14s var(--ease),
    background 0.14s var(--ease);
}
.peek-hint:hover {
  background: var(--accent-soft);
}
.skip {
  position: absolute;
  top: 12px;
  right: 14px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font: 12px/18px var(--font-ui);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.14s var(--ease), background 0.14s var(--ease);
}
.skip:hover:not(:disabled) {
  color: var(--accent-text);
  background: var(--accent-soft);
}
.skip:disabled {
  opacity: 0.45;
  cursor: default;
}

/* ===== 正文：全宽滚动（滚动条贴窗口边缘），内容列居中限宽 ===== */
.content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 滚动时内容在舞台下沿渐隐消失，而不是被硬切；静止时首行内容在渐隐区之下，不受影响。 */
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 22px);
  mask-image: linear-gradient(to bottom, transparent 0, #000 22px);
}
.column {
  box-sizing: border-box;
  /* 与设置页同一几何：外列 480（面板宽）、侧边距 20，卡片实宽 440 对齐设置卡片 */
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 22px 20px 16px;
}
h1 {
  font-family: Georgia, 'Songti SC', 'Noto Serif SC', serif;
  font-size: 26px;
  line-height: 1.35;
  font-weight: 400;
  letter-spacing: -0.01em;
  text-align: center;
  margin: 0 0 8px;
}
h1:focus {
  outline: none;
}
.intro {
  margin: 0 auto 18px;
  max-width: 30em;
  text-align: center;
  line-height: 1.8;
  color: var(--text-secondary);
}

/* ===== 卡片：纸底 + 1px 边框 + 圆角 12 ===== */
.card {
  box-sizing: border-box;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
}
.card + .card {
  margin-top: 10px;
}

/* 三条互动提示合成一张卡，行间只用细线分隔 */
.lessons {
  list-style: none;
  margin: 0;
  padding: 4px 16px;
}
.lessons li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 0;
}
.lessons li + li {
  border-top: 1px solid var(--border-subtle);
}
.lesson-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.lesson-copy {
  min-width: 0;
}
.lesson-copy strong {
  font-weight: 500;
  font-size: 14px;
  line-height: 20px;
}
.lesson-copy p {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.note {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-tertiary);
}
.note.plain {
  margin: 0;
  text-align: left;
}
.note.card-note {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
  text-align: left;
}
.note.now-playing {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

/* ===== 字段：大小与配色同在一张卡里 ===== */
.field + .field {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  line-height: 20px;
}
.value-text {
  font-weight: 600;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  display: block;
  width: 100%;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
.slider::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--fill, 0%),
    var(--bg-sunken) var(--fill, 0%),
    var(--bg-sunken) 100%
  );
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -6px;
  border-radius: 50%;
  background: var(--knob);
  border: 1.5px solid var(--border-strong);
  box-shadow: 0 1px 2px rgba(20, 20, 19, 0.12);
  cursor: pointer;
  transition:
    transform 0.12s var(--ease),
    border-color 0.12s var(--ease);
}
.slider:hover::-webkit-slider-thumb {
  transform: scale(1.1);
  border-color: var(--accent);
}
.slider:active::-webkit-slider-thumb {
  transform: scale(1.04);
}
/* 自定义色相：轨道即光谱，与设置页同一套 */
.slider.hue::-webkit-slider-runnable-track {
  background: linear-gradient(to right, #d97757, #e8c547, #5aab8c, #5b7fd9, #b35bd9, #d97757);
}
.slider.hue::-webkit-slider-thumb {
  border-color: rgba(255, 255, 255, 0.9);
}

/* ===== 配色色点 ===== */
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 2px 0;
}
.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  transition:
    transform 0.12s var(--ease),
    box-shadow 0.12s var(--ease);
}
.swatch:hover {
  transform: scale(1.08);
}
.swatch.on {
  box-shadow:
    0 0 0 2px var(--bg-surface),
    0 0 0 4px var(--accent);
}
.swatch.custom {
  background: var(--bg-sunken);
  display: grid;
  place-items: center;
}
.hue-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: conic-gradient(#d97757, #e8c547, #5aab8c, #5b7fd9, #b35bd9, #d97757);
}

/* ===== 桌面位置摆放图 ===== */
.placement-map {
  box-sizing: border-box;
  position: relative;
  margin: 0 auto;
  background: var(--bg-sunken);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  touch-action: none;
  cursor: crosshair;
  overflow: hidden;
}
.placement-map:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.screen-label {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  pointer-events: none;
}
.placement-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  color: var(--accent);
  font-size: 24px;
  line-height: 1;
  text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 45%, transparent);
  pointer-events: none;
}
.placement-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.coord {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

/* ===== 音乐：桌面两个并排大选项；Web 单选项通栏 + 隐藏文件输入 ===== */
.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.options .option.solo {
  grid-column: 1 / -1;
}
.web-music-file {
  display: none;
}
.music-now-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-sunken);
}
.music-now-row .note {
  margin: 0;
  text-align: left;
  flex: 1 1 auto;
  min-width: 0;
}
.music-now-row .btn-text {
  flex: 0 0 auto;
}
.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 96px;
  padding: 14px 10px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: 13px/18px var(--font-ui);
  text-align: center;
  cursor: pointer;
  transition:
    background 0.14s var(--ease),
    border-color 0.14s var(--ease),
    color 0.14s var(--ease),
    transform 0.12s var(--ease);
}
.option:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--bg-sunken);
}
.option:active:not(:disabled) {
  transform: scale(0.98);
}
.option.on {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent-text);
  font-weight: 600;
}
.option:disabled {
  opacity: 0.45;
  cursor: default;
}
.option-icon {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--accent-text);
}

.permission {
  margin-top: 12px;
  padding: 4px 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-tertiary);
}
.permission summary {
  cursor: pointer;
  padding: 8px 0;
}
.permission .note {
  padding-bottom: 10px;
}

/* ===== 页脚：左侧文字返回，右侧唯一实心主按钮 ===== */
footer {
  flex: 0 0 auto;
  padding: 8px 24px 18px;
}
.footer-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
}
.btn-text {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: 13px/18px var(--font-ui);
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.14s var(--ease),
    background 0.14s var(--ease);
}
.btn-text:hover:not(:disabled) {
  color: var(--accent-text);
  background: var(--accent-soft);
}
.btn-text:active:not(:disabled) {
  transform: scale(0.98);
}
.primary {
  margin-left: auto;
  min-width: 120px;
  min-height: 38px;
  padding: 0 20px;
  border: none;
  border-radius: 9px;
  background: var(--btn-solid);
  color: var(--btn-solid-ink);
  font: 600 13px/18px var(--font-ui);
  cursor: pointer;
  transition:
    filter 0.14s var(--ease),
    transform 0.12s var(--ease);
}
.primary:hover:not(:disabled) {
  filter: brightness(0.94);
}
.primary:active:not(:disabled) {
  transform: scale(0.98);
}
.primary:disabled,
.btn-text:disabled {
  opacity: 0.45;
  cursor: default;
}
.error {
  margin: 14px 0 0;
  text-align: center;
  color: var(--danger);
  font-size: 13px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

/* ===== 深色：与设置页同一套覆盖 ===== */
.welcome.dark {
  --bg-page: #262624;
  --bg-surface: #30302e;
  --bg-sunken: #1f1e1d;
  --text-primary: #faf9f5;
  --text-secondary: #c2c0b6;
  --text-tertiary: #9c9a92;
  --border-subtle: #3d3d3a;
  --border-strong: #5a5955;
  --accent: #e08a6b;
  --accent-text: #e08a6b;
  --accent-soft: rgba(224, 138, 107, 0.16);
  --btn-solid: #dc8b6c;
  --btn-solid-ink: #262624;
  --danger: #e5766f;
  --knob: #faf9f5;
}
@media (prefers-color-scheme: dark) {
  .welcome:not(.light) {
    --bg-page: #262624;
    --bg-surface: #30302e;
    --bg-sunken: #1f1e1d;
    --text-primary: #faf9f5;
    --text-secondary: #c2c0b6;
    --text-tertiary: #9c9a92;
    --border-subtle: #3d3d3a;
    --border-strong: #5a5955;
    --accent: #e08a6b;
    --accent-text: #e08a6b;
    --accent-soft: rgba(224, 138, 107, 0.16);
    --btn-solid: #dc8b6c;
    --btn-solid-ink: #262624;
    --danger: #e5766f;
    --knob: #faf9f5;
  }
}

@media (max-width: 440px) {
  .stage {
    padding: 10px 18px 8px;
  }
  .column {
    padding: 18px 18px 14px;
  }
  footer {
    padding: 6px 18px 14px;
  }
  h1 {
    font-size: 23px;
  }
}
/* 步骤切换：轻微升降渐隐，避免内容硬切 */
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.18s var(--ease);
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .welcome *,
  .welcome *::before,
  .welcome *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>

<style>
/* 窗口级 color-scheme：浅色纸面用浅色滚动条等原生控件，覆盖 index.html 的全局 dark。
   主题类挂在本组件根节点，:has 跟随浅/深切换（含 auto 跟随系统）。 */
html.settings-window {
  color-scheme: light;
}
html.settings-window:has(.welcome.dark) {
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  html.settings-window:not(:has(.welcome.light)) {
    color-scheme: dark;
  }
}
</style>
