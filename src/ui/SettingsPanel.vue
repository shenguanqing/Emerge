<script setup lang="ts">
import { usePaletteAccent } from './usePaletteAccent';
import SelectControl from './SelectControl.vue';
import TimeControls, { type TimeControlCommand } from './TimeControls.vue';
import { useSettingsSync } from './useSettingsSync';
/**
 * 设置面板（独立小窗口，托盘「设置」打开）。
 * 外观 / 行为 / 桌面位置 / 成长 / 怎么积累；连点页脚提示 5 次解锁内置时间加速。
 * 视觉遵循 docs 内 温暖极简 风格 UX/UI 规范：单一强调色、克制装饰、暖色纸感。
 */
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  COLOR_THEMES,
  DEFAULT_SETTINGS,
  diffSettings,
  loadSettings,
  mergeSettingsDraft,
  normalizePosition,
  resolveColors,
  patchSettings,
  type AppSettings,
  type ColorTheme,
} from '../core/settings';
import type { LifeEngine } from '../core/LifeEngine';
import { emitLocal, emitNative, invoke, isDesktop, listenLocal, listenNative } from '../platform/desktop';
import { locale, localeMode, setLocaleMode, stageDisplayName, t, type LocaleMode } from '../i18n';
import { CLOCK_STATE_STORAGE_KEY } from '../core/settings';

/**
 * embedded：主应用内嵌覆盖层（Web 端），无原生窗口标题栏，
 * 自带关闭按钮与 Esc 关闭，动作通过事件交给宿主处理。
 */
const props = defineProps<{ embedded?: boolean; preview?: boolean }>();
const emit = defineEmits<{ close: []; 'replay-welcome': [] }>();

const s = reactive<AppSettings>(loadSettings());
let lastSaved = { ...s };
let restoringDefaults = false;
useSettingsSync((patch) => {
  const next = mergeSettingsDraft(lastSaved, s, patch);
  lastSaved = next.saved;
  Object.assign(s, restoringDefaults ? DEFAULT_SETTINGS : next.editing);
});
const windowError = ref('');

/** 开机自启：以系统登录项为唯一真相源，不进 AppSettings 持久化；仅桌面设置窗读写。 */
const autostart = ref(false);
const autostartError = ref('');
async function refreshAutostart(): Promise<void> {
  if (!isDesktop) return;
  try {
    autostart.value = await invoke<boolean>('plugin:autostart|is_enabled');
    autostartError.value = '';
  } catch (error) { autostartError.value = String(error); }
}
async function onAutostartChange(): Promise<void> {
  if (!isDesktop) return;
  const next = autostart.value;
  try {
    await invoke(next ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
    autostartError.value = '';
  } catch (error) {
    autostart.value = !next;
    autostartError.value = String(error);
  }
}

/** 界面主题：auto 跟随系统，可手动切 light / dark；Web 端无存储时默认深色（与主画面一致），桌面保持 auto。 */
type ThemeMode = 'auto' | 'light' | 'dark';
function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem('emerge.ui.theme');
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch { /* ignore */ }
  return isDesktop ? 'auto' : 'dark';
}
const themeMode = ref<ThemeMode>(readStoredTheme());
const themeOptions = computed(() => [
  { id: 'auto' as ThemeMode, label: t('theme.auto') },
  { id: 'light' as ThemeMode, label: t('theme.light') },
  { id: 'dark' as ThemeMode, label: t('theme.dark') },
]);
const selectedTheme = computed({
  get: () => themeMode.value,
  set: (mode: ThemeMode) => {
    themeMode.value = mode;
    try { localStorage.setItem('emerge.ui.theme', mode); } catch { /* 存储不可用时仅本次生效 */ }
  },
});
const themeClass = computed(() =>
  themeMode.value === 'dark' ? 'dark' : themeMode.value === 'light' ? 'light' : '',
);

/** 界面语言：auto 跟随系统，可手动切 zh / en / ja / ko。 */
const langOptions = computed(() => [
  { id: 'auto' as LocaleMode, label: t('lang.auto') },
  { id: 'zh' as LocaleMode, label: '中文' },
  { id: 'en' as LocaleMode, label: 'English' },
  { id: 'ja' as LocaleMode, label: '日本語' },
  { id: 'ko' as LocaleMode, label: '한국어' },
]);
const selectedLocale = computed({
  get: () => localeMode.value,
  set: setLocaleMode,
});

/** 隐藏：连点页脚提示 5 次（2.5s 内）解锁时间加速。 */
const timeUnlocked = ref(false);
const titleTaps = ref(0);
const titleLit = ref(0);
let tapTimer = 0;
const vnow = ref('—');
const growthInfo = ref<ReturnType<LifeEngine['getGrowthSummary']>>(null);
const currentScale = ref(1);

const STAGES = computed(() => [
  { id: 'origin', name: stageDisplayName('origin'), range: '0–30%', desc: t('stage.originDesc') },
  { id: 'awaken', name: stageDisplayName('awaken'), range: '30–55%', desc: t('stage.awakenDesc') },
  { id: 'conscious', name: stageDisplayName('conscious'), range: '55–85%', desc: t('stage.consciousDesc') },
  { id: 'emerge', name: stageDisplayName('emerge'), range: '85–100%', desc: t('stage.emergeDesc') },
]);

const PATHS = computed(() => [
  { name: t('path.companion'), desc: t('path.companionDesc') },
  { name: t('path.interaction'), desc: t('path.interactionDesc') },
  { name: t('path.music'), desc: t('path.musicDesc') },
]);

const stageIndex = computed(() => {
  const g = growthInfo.value?.growth ?? 0;
  return g < 0.3 ? 0 : g < 0.55 ? 1 : g < 0.85 ? 2 : 3;
});
const stageName = computed(() => STAGES.value[stageIndex.value].name);

/** 滑块显示值：整数百分比 / 角度，只读，靠滑杆调整。 */
const bodyScalePct = computed(() => Math.round(s.bodyScale * 100));
const brightnessPct = computed(() => Math.round(s.brightness * 100));
const pointScalePct = computed(() => Math.round(s.pointScale * 100));
const hueDeg = computed(() => Math.round(s.hue));

/** 向其它窗口发原生事件；同页覆盖层（Web）走 DOM 事件直达宿主。 */
function send(event: string, payload: unknown): void {
  emitLocal(event, payload);
  if (!isDesktop) return;
  try { void Promise.resolve(emitNative(event, payload)).catch(() => {}); } catch { /* 忽略 */ }
}

function onSecretTap(): void {
  titleTaps.value += 1;
  titleLit.value = titleTaps.value;
  clearTimeout(tapTimer);
  tapTimer = window.setTimeout(() => {
    titleTaps.value = 0;
    titleLit.value = 0;
  }, 2500);
  if (titleTaps.value >= 5) {
    titleTaps.value = 0;
    titleLit.value = 0;
    timeUnlocked.value = true;
  }
}

function sendTimeControl(command: TimeControlCommand): void {
  send('time-control', command);
}

function emitSettings(): void {
  const patch = restoringDefaults ? { ...DEFAULT_SETTINGS } : diffSettings(lastSaved, s);
  restoringDefaults = false;
  if (!Object.keys(patch).length) return;
  lastSaved = patchSettings(patch);
  Object.assign(s, lastSaved);
  send('app-settings-changed', patch);
  send('visual-settings', {
    bodyScale: s.bodyScale,
    brightness: s.brightness,
    pointScale: s.pointScale,
    theme: s.theme,
    hue: s.hue,
    colors: resolveColors(s),
  });
  send('desktop-position', { x: s.positionX, y: s.positionY });
}

/** 拖动滑条时每帧最多落盘 + 通知一次，避免 input 事件洪流。 */
let emitFrame = 0;
function scheduleEmit(): void {
  if (emitFrame) return;
  emitFrame = requestAnimationFrame(() => { emitFrame = 0; emitSettings(); });
}
watch(s, scheduleEmit, { deep: true });
// 拖动位置不重复抬起设置窗口，避免打断指针捕获。
let windowUpdate = Promise.resolve();
watch(() => [s.topmost, s.clickthrough], () => {
  if (!isDesktop) return;
  const flags = { topmost: s.topmost, clickthrough: s.clickthrough };
  windowUpdate = windowUpdate.then(async () => {
    if (flags.topmost !== s.topmost || flags.clickthrough !== s.clickthrough) return;
    try {
      await invoke('apply_settings', flags);
      windowError.value = '';
    } catch (error) { windowError.value = t('behavior.windowError', { e: String(error) }); }
  });
}, { immediate: true });

/** 摆放预览按宿主显示区域比例：桌面为整块屏幕，Web 为浏览器视口。 */
const screenWidth = isDesktop ? (window.screen?.width ?? 16) : (window.innerWidth || 16);
const screenHeight = isDesktop ? (window.screen?.height ?? 10) : (window.innerHeight || 10);
const placing = ref(false);
function movePlacement(event: PointerEvent): void {
  if (!placing.value) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  s.positionX = normalizePosition((event.clientX - box.left) / box.width);
  s.positionY = normalizePosition((event.clientY - box.top) / box.height);
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
  s.positionX = normalizePosition(s.positionX + direction[0] * 0.01);
  s.positionY = normalizePosition(s.positionY + direction[1] * 0.01);
}

async function replayWelcome(): Promise<void> {
  if (props.embedded) { emit('replay-welcome'); return; }
  if (!isDesktop) { location.href = '?window=welcome'; return; }
  try { await invoke('open_onboarding'); }
  catch (error) { windowError.value = String(error); }
}

/** Web 直链模式（?window=settings）没有原生窗口按钮，提供返回主应用入口。 */
function backToApp(): void {
  location.href = location.origin + location.pathname;
}

/** 「恢复默认」同样两段确认：第一次点亮确认态，4 秒内再点才执行。 */
const confirmDefaults = ref(false);
let defaultsArmTimer = 0;
const confirmDefaultsLabel = computed(() => t('settings.resetConfirm'));
function reset(): void {
  if (!confirmDefaults.value) {
    confirmDefaults.value = true;
    clearTimeout(defaultsArmTimer);
    defaultsArmTimer = window.setTimeout(() => { confirmDefaults.value = false; }, 4000);
    return;
  }
  clearTimeout(defaultsArmTimer);
  confirmDefaults.value = false;
  restoringDefaults = true;
  Object.assign(s, DEFAULT_SETTINGS);
  scheduleEmit();
}

const themeName = computed(() => (s.theme === 'custom' ? t('palette.custom') : t(`theme.${s.theme}`)));

/** 成长路径：点击阶段节点预览该阶段说明，默认停在当前阶段。 */
const viewStage = ref<number | null>(null);
const shownStage = computed(() => viewStage.value ?? stageIndex.value);

function swatchColor(body: [number, number, number]): string {
  return `rgb(${body.map((c) => Math.round(c * 255)).join(',')})`;
}

/** 色点用「核白→主体→深晕」径向渐变预览，贴近粒子实际加法发光的观感。 */
function swatchStyle(theme: ColorTheme): Record<string, string> {
  return {
    background: `radial-gradient(circle at 50% 44%, ${swatchColor(theme.core)} 0%, ${swatchColor(theme.body)} 46%, ${swatchColor(theme.aura)} 100%)`,
  };
}

/** 滑条已滑过比例 0–100%，驱动填充色。 */
function sliderFill(value: number, min: number, max: number): Record<string, string> {
  const pct = ((value - min) / (max - min)) * 100;
  return { '--fill': `${pct}%` };
}

type ClockStatePayload = { vnow: string; scale: number; growth: ReturnType<LifeEngine['getGrowthSummary']> };
function receiveClock(c: ClockStatePayload): void {
  vnow.value = c.vnow;
  currentScale.value = c.scale;
  growthInfo.value = c.growth;
}

const unlistens: Array<() => void> = [];
let disposed = false;

/** 跨标签页（Web 直链设置页）读取主窗写入的时钟快照。 */
function onClockStorage(event: StorageEvent): void {
  if (event.key !== CLOCK_STATE_STORAGE_KEY || !event.newValue) return;
  try { receiveClock(JSON.parse(event.newValue) as ClockStatePayload); } catch { /* 损坏快照忽略 */ }
}

onMounted(() => {
  void refreshAutostart();
  void listenNative<ClockStatePayload>('clock-state', receiveClock).then((un) => {
    if (disposed) un(); else unlistens.push(un);
  });
  // 同页内嵌覆盖层（Web）：主循环通过 DOM 事件桥推送。
  unlistens.push(listenLocal<ClockStatePayload>('clock-state', receiveClock));
  window.addEventListener('storage', onClockStorage);
});

// 语言在设置窗（独立 WebView）里切换：同步到托盘/设置窗标题与主窗界面。
if (isDesktop) {
  void invoke('set_ui_locale', { locale: locale.value }).catch(() => {});
  watch(locale, (loc) => {
    void invoke('set_ui_locale', { locale: loc }).catch(() => {});
  });
}
watch(localeMode, (mode) => send('ui-locale-changed', mode));

onBeforeUnmount(() => {
  disposed = true;
  for (const un of unlistens) un();
  window.removeEventListener('storage', onClockStorage);
  // 关窗前把尚未发出的改动落下，避免丢最后一次拖动。
  if (emitFrame) { cancelAnimationFrame(emitFrame); emitFrame = 0; emitSettings(); }
  clearTimeout(tapTimer);
  clearTimeout(defaultsArmTimer);
});
const accentStyle = usePaletteAccent(s, () => themeMode.value);
</script>

<template>
  <div class="page" :class="themeClass" :style="accentStyle">
    <header class="top">
      <div class="top-copy">
        <h1>{{ t('settings.title') }}</h1>
        <p class="eyebrow">Emerge · Particle Life</p>
      </div>
      <div class="top-actions">
        <button
          v-if="!isDesktop && !props.embedded"
          type="button"
          class="btn-outline"
          @click="backToApp"
        >{{ t('settings.backToApp') }}</button>
        <button
          v-if="props.embedded"
          type="button"
          class="btn-close"
          :aria-label="t('settings.close')"
          @click="emit('close')"
        >✕</button>
      </div>
    </header>



    <section class="card">
      <h2>{{ t('section.appearance') }}</h2>

      <div class="field">
        <div class="label-row">
          <label for="slider-body">{{ t('appearance.bodySize') }}</label>
          <strong class="value-text">{{ bodyScalePct }}%</strong>
        </div>
        <input
          id="slider-body"
          v-model.number="s.bodyScale"
          class="slider"
          type="range"
          min="0.1"
          max="1"
          step="0.01"
          :style="sliderFill(s.bodyScale, 0.1, 1)"
        />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="slider-brightness">{{ t('appearance.brightness') }}</label>
          <strong class="value-text">{{ brightnessPct }}%</strong>
        </div>
        <input
          id="slider-brightness"
          v-model.number="s.brightness"
          class="slider"
          type="range"
          min="0.5"
          max="1.35"
          step="0.01"
          :style="sliderFill(s.brightness, 0.5, 1.35)"
        />
      </div>

      <div class="field">
        <div class="label-row">
          <label for="slider-point">{{ t('appearance.pointSize') }}</label>
          <strong class="value-text">{{ pointScalePct }}%</strong>
        </div>
        <input
          id="slider-point"
          v-model.number="s.pointScale"
          class="slider"
          type="range"
          min="0.4"
          max="1.6"
          step="0.01"
          :style="sliderFill(s.pointScale, 0.4, 1.6)"
        />
      </div>

      <div class="field">
        <div class="label-row">
          <span id="swatch-label">{{ t('appearance.palette') }}</span>
          <span class="value-text">{{ themeName }}</span>
        </div>
        <div class="swatches" role="group" aria-labelledby="swatch-label">
          <button
            v-for="theme in COLOR_THEMES"
            :key="theme.id"
            type="button"
            class="swatch"
            :class="{ on: s.theme === theme.id }"
            :title="t(`theme.${theme.id}`)"
            :aria-label="t(`theme.${theme.id}`)"
            :aria-pressed="s.theme === theme.id"
            :style="swatchStyle(theme)"
            @click="s.theme = theme.id"
          />
          <button
            type="button"
            class="swatch custom"
            :class="{ on: s.theme === 'custom' }"
            :title="t('palette.custom')"
            :aria-label="t('palette.custom')"
            :aria-pressed="s.theme === 'custom'"
            @click="s.theme = 'custom'"
          >
            <span class="hue-dot" />
          </button>
        </div>
      </div>

      <div v-if="s.theme === 'custom'" class="field">
        <div class="label-row">
          <label for="slider-hue">{{ t('appearance.hue') }}</label>
          <strong class="value-text">{{ hueDeg }}°</strong>
        </div>
        <input
          id="slider-hue"
          v-model.number="s.hue"
          class="slider hue"
          type="range"
          min="0"
          max="360"
          step="1"
        />
      </div>
    </section>

    <section v-if="isDesktop" class="card">
      <h2>{{ t('section.behavior') }}</h2>
      <p v-if="windowError" role="alert" class="note error">
        <span aria-hidden="true">⚠</span> {{ windowError }}
      </p>

      <div class="toggle-row">
        <div class="toggle-copy">
          <strong>{{ t('behavior.topmost') }}</strong>
          <em>{{ t('behavior.topmostDesc') }}</em>
        </div>
        <input
          id="toggle-topmost"
          v-model="s.topmost"
          type="checkbox"
          role="switch"
          class="switch"
          :aria-label="t('behavior.topmost')"
        />
      </div>

      <div class="toggle-row">
        <div class="toggle-copy">
          <strong>{{ t('behavior.clickthrough') }}</strong>
          <em>{{ t('behavior.clickthroughDesc') }}</em>
        </div>
        <input
          id="toggle-clickthrough"
          v-model="s.clickthrough"
          type="checkbox"
          role="switch"
          class="switch"
          :aria-label="t('behavior.clickthrough')"
        />
      </div>

      <p class="note plain">{{ t('behavior.note') }}</p>
    </section>

    <section class="card">
      <h2>{{ t('section.position') }}</h2>
      <div class="placement-map" tabindex="0" role="group" :aria-label="t('section.position')"
        :style="{ aspectRatio: `${screenWidth} / ${screenHeight}` }"
        @pointerdown="startPlacement" @pointermove="movePlacement"
        @pointerup="placing = false" @pointercancel="placing = false" @lostpointercapture="placing = false"
        @keydown="keyPlacement">
        <span class="screen-label">{{ isDesktop ? t('position.desktop') : t('position.page') }}</span>
        <span class="placement-marker" :style="{ left: `${s.positionX * 100}%`, top: `${s.positionY * 100}%` }">✦</span>
      </div>
      <div class="placement-meta">
        <p class="note plain">{{ t('position.hint') }}</p>
        <p class="coord" aria-live="polite">{{ Math.round(s.positionX * 100) }}% · {{ Math.round(s.positionY * 100) }}%</p>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('section.growth') }}</h2>

      <template v-if="growthInfo">
        <div class="growth-head">
          <div>
            <span class="stage-chip">{{ stageName }}</span>
            <p class="growth-pct">{{ (growthInfo.growth * 100).toFixed(1) }}%</p>
          </div>
          <div class="growth-meta">
            <p class="growth-sub">
              {{ t('growth.sub', { m: Math.floor(growthInfo.companionMinutes), d: growthInfo.days }) }}
            </p>
            <p v-if="growthInfo.lifeId" class="life-id">{{ growthInfo.lifeId }}</p>
          </div>
        </div>
        <div
          class="growth-progress"
          role="progressbar"
          :aria-label="t('section.growth')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(growthInfo.growth * 100)"
        >
          <div class="growth-progress-fill" :style="{ width: `${growthInfo.growth * 100}%` }" />
        </div>

        <div class="stat-grid">
          <div class="stat">
            <span class="stat-label">{{ t('growth.companion') }}</span>
            <strong>{{ Math.floor(growthInfo.companionMinutes) }} {{ t('unit.minutes') }}</strong>
          </div>
          <div class="stat">
            <span class="stat-label">{{ t('growth.days') }}</span>
            <strong>{{ growthInfo.days }} {{ t('unit.days') }}</strong>
          </div>
          <div class="stat">
            <span class="stat-label">{{ t('growth.interaction') }}</span>
            <strong>{{ growthInfo.interactionMinutes.toFixed(1) }} {{ t('unit.minutes') }}</strong>
          </div>
          <div class="stat">
            <span class="stat-label">{{ t('growth.music') }}</span>
            <strong>{{ growthInfo.musicMinutes.toFixed(1) }} {{ t('unit.minutes') }}</strong>
          </div>
        </div>
      </template>
      <p v-else class="note plain">{{ t('growth.waiting') }}</p>

      <div class="stage-path" role="group" :aria-label="t('section.growth')">
        <button
          v-for="(st, i) in STAGES"
          :key="st.id"
          type="button"
          class="stage-node"
          :class="{ on: growthInfo ? i <= stageIndex : false, now: growthInfo ? i === stageIndex : false, picked: i === shownStage }"
          :aria-pressed="i === shownStage"
          @click="viewStage = i"
        >
          <span class="stage-track"><span class="stage-dot" /></span>
          <span class="stage-name">{{ st.name }}</span>
          <span class="stage-range">{{ st.range }}</span>
        </button>
      </div>
      <p class="stage-desc" aria-live="polite">
        <strong>{{ STAGES[shownStage].name }}</strong>{{ STAGES[shownStage].desc }}
      </p>

      <details class="paths">
        <summary>{{ t('section.paths') }}</summary>
        <ul class="path-list">
          <li v-for="p in PATHS" :key="p.name">
            <strong>{{ p.name }}</strong>
            <span>{{ p.desc }}</span>
          </li>
        </ul>
        <p class="note plain">{{ t('paths.note') }}</p>
      </details>
    </section>

    <div v-if="timeUnlocked" class="card time-card">
      <TimeControls :vnow="vnow" :scale="currentScale" :preview="preview"
        :notice="t('time.unlocked')" @command="sendTimeControl" />
    </div>



    <section class="card" aria-labelledby="general-title">
      <h2 id="general-title">{{ t('section.general') }}</h2>
      <div class="general-row">
        <label id="select-language-label" for="select-language">{{ t('lang.label') }}</label>
        <SelectControl id="select-language" v-model="selectedLocale" :options="langOptions" />
      </div>
      <div class="general-row">
        <label id="select-theme-label" for="select-theme">{{ t('theme.label') }}</label>
        <SelectControl id="select-theme" v-model="selectedTheme" :options="themeOptions" />
      </div>
      <div v-if="isDesktop" class="toggle-row">
        <div class="toggle-copy">
          <strong>{{ t('general.autostart') }}</strong>
          <em>{{ t('general.autostartDesc') }}</em>
        </div>
        <input
          id="toggle-autostart"
          v-model="autostart"
          type="checkbox"
          role="switch"
          class="switch"
          :aria-label="t('general.autostart')"
          @change="onAutostartChange"
        />
      </div>
      <p v-if="isDesktop && autostartError" role="alert" class="note error">
        <span aria-hidden="true">⚠</span> {{ autostartError }}
      </p>
      <div class="actions-row general-actions">
        <button type="button" class="btn-outline" @click="replayWelcome">{{ t('welcome.replay') }}</button>
        <button type="button" class="btn-text" :class="{ armed: confirmDefaults }" @click="reset">
          {{ confirmDefaults ? confirmDefaultsLabel : t('settings.reset') }}
        </button>
      </div>
    </section>

    <p
      class="footer-hint"
      :class="{ lit: titleLit }"
      :style="titleLit ? { opacity: 0.7 + titleLit * 0.05 } : undefined"
      :title="t('footer.title')"
      @click="onSecretTap"
    >
      {{ t(isDesktop ? 'footer.hint' : 'footer.hintWeb') }}
    </p>
  </div>
</template>

<style scoped>
/* ===== Design Tokens：温暖极简 风格规范（浅色默认，深色见下方覆盖） ===== */
.page {
  --bg-page: #faf9f5;
  --bg-surface: #ffffff;
  --bg-sunken: #f0eee6;
  --text-primary: #141413;
  --text-secondary: #5e5d59;
  --text-tertiary: #87867f;
  --border-subtle: #e8e6dc;
  --border-strong: #d1cfc5;
  --accent: #d97757;
  --accent-hover: #c6613f;
  /* 浅底上的强调色文字用更深的 hover 档，保证对比度 */
  --accent-text: #a85e43;
  --accent-soft: rgba(217, 119, 87, 0.12);
  --danger: #b53333;
  --danger-soft: rgba(181, 51, 51, 0.1);
  --success: #788c5d;
  --info: #6a9bcb;
  --knob: #ffffff;
  --switch-off: #b0aea5;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-pop: 0 4px 24px rgba(20, 20, 19, 0.08);
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --font-ui:
    system-ui,
    -apple-system,
    'PingFang SC',
    'Noto Sans SC',
    'Segoe UI',
    sans-serif;

  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  padding: max(24px, env(safe-area-inset-top, 0px)) 20px 32px;
  box-sizing: border-box;
  background: var(--bg-page);
  color: var(--text-primary);
  overflow-x: hidden;
  overflow-y: auto;
  font: 14px/20px var(--font-ui);
  -webkit-font-smoothing: antialiased;
}

.page.dark {
  --bg-page: #262624;
  --bg-surface: #30302e;
  --bg-sunken: #1f1e1d;
  --text-primary: #faf9f5;
  --text-secondary: #c2c0b6;
  --text-tertiary: #9c9a92;
  --border-subtle: #3d3d3a;
  --border-strong: #5a5955;
  --accent: #e08a6b;
  --accent-hover: #eba085;
  --accent-text: #e08a6b;
  --accent-soft: rgba(224, 138, 107, 0.16);
  --danger: #e5766f;
  --danger-soft: rgba(229, 118, 111, 0.14);
  --success: #96aa7b;
  --info: #8db4da;
  --knob: #faf9f5;
  --switch-off: #5a5955;
}

@media (prefers-color-scheme: dark) {
  .page:not(.light) {
    --bg-page: #262624;
    --bg-surface: #30302e;
    --bg-sunken: #1f1e1d;
    --text-primary: #faf9f5;
    --text-secondary: #c2c0b6;
    --text-tertiary: #9c9a92;
    --border-subtle: #3d3d3a;
    --border-strong: #5a5955;
    --accent: #e08a6b;
    --accent-hover: #eba085;
    --accent-text: #e08a6b;
    --accent-soft: rgba(224, 138, 107, 0.16);
    --danger: #e5766f;
    --danger-soft: rgba(229, 118, 111, 0.14);
    --success: #96aa7b;
    --info: #8db4da;
    --knob: #faf9f5;
    --switch-off: #5a5955;
  }
}

/* 焦点环统一：仅键盘聚焦时显示 */
.page :focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.page :focus:not(:focus-visible) {
  outline: none;
}

/* ===== 页头 ===== */
.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 2px 20px;
}

.top-copy {
  min-width: 0;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 内嵌覆盖层的关闭按钮：与文字按钮同级的轻量圆形入口 */
.btn-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font: 14px/1 var(--font-ui);
  cursor: pointer;
  transition:
    border-color 0.14s var(--ease),
    color 0.14s var(--ease),
    background 0.14s var(--ease),
    transform 0.12s var(--ease);
}
.btn-close:hover {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-soft);
}
.btn-close:active {
  transform: scale(0.96);
}

.general-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.general-row + .general-row {
  margin-top: 12px;
}

.eyebrow {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 36px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

/* 分段控件：灰底轨道 + 选中白底轻边框；轨道统一 30px 高 */
.segmented {
  display: inline-flex;
  height: 30px;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  gap: 2px;
  box-sizing: border-box;
}

.seg {
  display: inline-flex;
  align-items: center;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: 12px/18px var(--font-ui);
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.14s var(--ease),
    color 0.14s var(--ease);
}
.seg:hover {
  color: var(--text-primary);
}
.seg.on {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow:
    inset 0 0 0 1px var(--border-subtle),
    0 1px 2px rgba(20, 20, 19, 0.06);
}

/* 文字按钮（恢复默认等次要操作） */
.btn-text {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: 13px/18px var(--font-ui);
  padding: 6px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.14s var(--ease),
    background 0.14s var(--ease);
}
.btn-text:hover {
  color: var(--accent-text);
  background: var(--accent-soft);
}
.btn-text:active {
  transform: scale(0.98);
}
.btn-text.armed {
  color: var(--danger);
  background: var(--danger-soft);
}

/* 描边按钮（重新查看欢迎引导等次要入口）：细边框，悬停轻强调 */
.btn-outline {
  border: 1px solid var(--border-strong);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: 13px/18px var(--font-ui);
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.14s var(--ease),
    color 0.14s var(--ease),
    background 0.14s var(--ease),
    transform 0.12s var(--ease);
}
.btn-outline:hover {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-soft);
}
.btn-outline:active {
  transform: scale(0.98);
}

.general-actions {
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.general-actions > button {
  box-sizing: border-box;
  height: 30px;
  min-height: 30px;
  padding-top: 0;
  padding-bottom: 0;
}

.actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* ===== 卡片：白底 + 1px 边框 + 圆角 12，无阴影，悬停边框加深 ===== */
.card {
  box-sizing: border-box;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  transition: border-color 0.16s var(--ease);
}
.card:hover {
  border-color: var(--border-strong);
}

h2 {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ===== 字段与滑块 ===== */
.field {
  padding: 8px 0 12px;
}
.field + .field {
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
}
.field:last-child {
  padding-bottom: 2px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  line-height: 20px;
  color: var(--text-primary);
}

/* 滑块右侧只读数值（调整只靠拖动） */
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
/* 色相滑块：轨道即光谱，按颜色选 */
.slider.hue::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    #d97757,
    #e8c547,
    #5aab8c,
    #5b7fd9,
    #b35bd9,
    #d97757
  );
}
.slider.hue::-webkit-slider-thumb {
  border-color: rgba(255, 255, 255, 0.9);
}

/* ===== 配色色点 ===== */
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 2px 0 4px;
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

/* ===== 成长 ===== */
.growth-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.growth-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}

.stage-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.growth-pct {
  margin: 8px 0 0;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.growth-sub {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  text-align: right;
}

.life-id {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  opacity: 0.75;
}

.growth-progress {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-sunken);
  overflow: hidden;
  margin: 0 0 14px;
}
.growth-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.25s var(--ease);
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 18px;
}

.stat {
  background: var(--bg-sunken);
  border-radius: 8px;
  padding: 10px 12px;
}

.stat-label {
  display: block;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  margin-bottom: 2px;
}

.stat strong {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stage-path {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  margin: 4px 0 12px;
}

.stage-node {
  display: block;
  min-width: 0;
  padding: 2px 0 0;
  border: none;
  background: transparent;
  font: inherit;
  text-align: center;
  cursor: pointer;
}
.stage-name,
.stage-range {
  display: block;
}

.stage-track {
  position: relative;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  background: var(--bg-sunken);
  transform: translateY(-50%);
}
.stage-node:first-child .stage-track::before {
  left: 50%;
}
.stage-node:last-child .stage-track::before {
  right: 50%;
}
.stage-node.on .stage-track::before {
  background: color-mix(in srgb, var(--accent) 55%, var(--bg-sunken));
}

.stage-dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border-strong);
  border: 2px solid var(--bg-surface);
  box-sizing: content-box;
}
.stage-node.on .stage-dot {
  background: var(--accent);
}
.stage-node.now .stage-dot {
  width: 11px;
  height: 11px;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.stage-name {
  margin-top: 6px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--text-tertiary);
}
.stage-node.on .stage-name {
  color: var(--text-secondary);
}
.stage-node.now .stage-name {
  color: var(--accent-text);
}

.stage-range {
  position: relative;
  padding-bottom: 7px;
  margin-top: 1px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.path-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.path-list li {
  display: grid;
  /* 固定列宽：所有说明文字左对齐（auto 会按行内最长名称各自缩进）；
     96px 足够容纳 "Conscious" / "Gentle play" 等最长名称 */
  grid-template-columns: 96px 1fr;
  column-gap: 12px;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
  line-height: 20px;
}

.path-list li:first-child {
  border-top: none;
  padding-top: 2px;
}

.path-list strong {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.path-list span {
  color: var(--text-secondary);
}

/* 预览中的阶段：名称加粗转主色 + 下方一根短横线；不加底色块 */
.stage-node:hover .stage-name {
  color: var(--text-primary);
}
.stage-node.picked .stage-name {
  color: var(--text-primary);
  font-weight: 600;
}
.stage-node.picked.now .stage-name {
  color: var(--accent-text);
}
.stage-node.picked .stage-range::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 16px;
  height: 2px;
  margin-left: -8px;
  border-radius: 2px;
  background: var(--text-primary);
}
.stage-node.picked.now .stage-range::after {
  background: var(--accent);
}

.stage-desc {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary);
}
.stage-desc strong {
  margin-right: 8px;
  font-weight: 500;
  color: var(--text-primary);
}
.paths {
  margin-top: 8px;
  border-top: 1px solid var(--border-subtle);
}
.paths summary {
  padding: 10px 0 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary);
  cursor: pointer;
}
.paths .note.plain {
  margin-top: 8px;
}

/* ===== 开关行：左侧仅文案，只有右侧开关可点 ===== */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
}
.toggle-row + .toggle-row {
  border-top: 1px solid var(--border-subtle);
}

.toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.toggle-copy strong {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 20px;
}
.toggle-copy em {
  font-style: normal;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary);
}

/* 开关：44×24，关闭灰、开启橙，滑块 20px */
.switch {
  appearance: none;
  -webkit-appearance: none;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--switch-off);
  position: relative;
  cursor: pointer;
  flex: 0 0 auto;
  transition: background 0.16s var(--ease);
  border: none;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--knob);
  box-shadow: 0 1px 3px rgba(20, 20, 19, 0.2);
  transition: transform 0.16s var(--ease);
}
.switch:checked {
  background: var(--accent);
}
.switch:checked::after {
  transform: translateX(20px);
}

/* ===== 说明文字 ===== */
.note {
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
}
.note.plain {
  border-top: none;
  padding-top: 0;
}
.note.ok {
  color: var(--success);
}
.note.error {
  color: var(--danger);
  border-top: none;
  padding-top: 0;
  margin-top: 0;
  margin-bottom: 8px;
}

/* ===== 桌面位置预览 ===== */
.placement-map {
  position: relative;
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
  top: 10px;
  left: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 18px;
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
.placement-meta .note {
  margin: 0;
  padding: 0;
  border: none;
}
.coord {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

/* ===== 页脚提示 ===== */
.footer-hint {
  margin: 20px 2px 8px;
  text-align: center;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
  cursor: default;
  user-select: none;
  transition: color 0.2s var(--ease), opacity 0.2s var(--ease);
}
.footer-hint:hover {
  color: var(--text-secondary);
}
.footer-hint.lit {
  color: var(--accent-text);
}

/* 尊重系统减少动效偏好 */
@media (prefers-reduced-motion: reduce) {
  .page *,
  .page *::before,
  .page *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}

/* Web 宽视口：内容列限宽居中，比例对齐桌面设置窗（420pt）；桌面窄窗不受影响。
   放在样式末尾让 auto 边距覆盖 .top / .footer-hint 的 2px 侧边距。 */
.page > * {
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

@media (max-width: 440px) {
  .btn-text,
  .btn-outline {
    min-height: 44px;
  }
}
</style>

<style>
/* 窗口级 color-scheme：浅色纸面用浅色滚动条等原生控件，覆盖 index.html 的全局 dark。
   主题类挂在本组件根节点，:has 跟随浅/深切换（含 auto 跟随系统）。 */
html.settings-window {
  color-scheme: light;
}
html.settings-window:has(.page.dark) {
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  html.settings-window:not(:has(.page.light)) {
    color-scheme: dark;
  }
}
</style>
