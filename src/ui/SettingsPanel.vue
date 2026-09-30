<script setup lang="ts">
/**
 * 设置面板（独立小窗口，托盘「设置」打开）。
 * 外观 / 行为 / 桌面位置 / 成长 / 怎么积累；连点页脚提示 5 次解锁内置时间加速。
 * 视觉遵循 docs 内 Claude 风格 UX/UI 规范：单一强调色、克制装饰、暖色纸感。
 */
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  COLOR_THEMES,
  DEFAULT_SETTINGS,
  loadSettings,
  normalizePosition,
  resolveColors,
  saveSettings,
  type AppSettings,
} from '../core/settings';
import type { LifeEngine } from '../core/LifeEngine';
import { invoke, isDesktop, listenNative } from '../platform/desktop';

const s = reactive<AppSettings>(loadSettings());
const windowError = ref('');

/** 界面主题：auto 跟随系统，可手动切 light / dark。 */
type ThemeMode = 'auto' | 'light' | 'dark';
const themeMode = ref<ThemeMode>(
  (localStorage.getItem('emerge.ui.theme') as ThemeMode | null) ?? 'auto',
);
const themeOptions: { id: ThemeMode; label: string }[] = [
  { id: 'auto', label: '自动' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];
function setTheme(mode: ThemeMode): void {
  themeMode.value = mode;
  localStorage.setItem('emerge.ui.theme', mode);
}
const themeClass = computed(() =>
  themeMode.value === 'dark' ? 'dark' : themeMode.value === 'light' ? 'light' : '',
);

/** 隐藏：连点页脚提示 5 次（2.5s 内）解锁时间加速。 */
const timeUnlocked = ref(false);
const titleTaps = ref(0);
const titleLit = ref(0);
let tapTimer = 0;
const vnow = ref('—');
const growthInfo = ref<ReturnType<LifeEngine['getGrowthSummary']>>(null);
const currentScale = ref(1);
const lastAction = ref('');
const scales = [1, 10, 100, 500, 2000];

const STAGES = [
  { id: 'nascent', name: '初生', range: '0–30%', desc: '紧凑星云，身体还在凝聚' },
  { id: 'formed', name: '成形', range: '30–55%', desc: '身体轮廓稳定成形' },
  { id: 'ringed', name: '环生', range: '55–85%', desc: '长出行星环，结构更丰富' },
  { id: 'dual', name: '双核', range: '85–100%', desc: '解锁第二核心与旋臂' },
] as const;

const PATHS = [
  {
    name: '陪伴',
    desc: '窗口显示时累计，隐藏、关闭与休眠不计。仅靠陪伴也能成熟。',
  },
  {
    name: '温和互动',
    desc: '粒子附近的真实低速移动、轻点后的短暂回应。快速划过不计。每日前 20 分钟贡献较高。',
  },
  {
    name: '音乐',
    desc: '连续有声两秒起计，静音不算。每日前 30 分钟贡献较高，之后递减。',
  },
] as const;

const stageIndex = computed(() => {
  const g = growthInfo.value?.growth ?? 0;
  return g < 0.3 ? 0 : g < 0.55 ? 1 : g < 0.85 ? 2 : 3;
});
const stageName = computed(() => STAGES[stageIndex.value].name);

/** 滑块显示值：整数百分比 / 角度，只读，靠滑杆调整。 */
const bodyScalePct = computed(() => Math.round(s.bodyScale * 100));
const brightnessPct = computed(() => Math.round(s.brightness * 100));
const pointScalePct = computed(() => Math.round(s.pointScale * 100));
const hueDeg = computed(() => Math.round(s.hue));

function emitTauri(event: string, payload: unknown): void {
  void (window as typeof window & {
    __TAURI__?: { event?: { emit: (e: string, p: unknown) => Promise<void> } };
  }).__TAURI__?.event?.emit(event, payload);
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
    lastAction.value = '时间加速已解锁';
  }
}

function applyScale(n: number): void {
  currentScale.value = n;
  lastAction.value = `时间倍率 ×${n}`;
  emitTauri('time-control', { type: 'scale', value: n });
}

function timeAction(
  type: 'advance' | 'interaction' | 'absence' | 'reset',
  value: number,
): void {
  lastAction.value =
    type === 'advance'
      ? `+${value} 天`
      : type === 'interaction'
        ? `+${value} 分钟互动`
        : type === 'absence'
          ? `模拟离开 ${value} 天`
          : '生命已重置';
  emitTauri('time-control', { type, value });
}

/** 破坏性操作两段确认：第一次点亮确认态，4 秒内再点才执行。 */
const confirmReset = ref(false);
let resetArmTimer = 0;
function onResetLife(): void {
  if (!confirmReset.value) {
    confirmReset.value = true;
    lastAction.value = '';
    clearTimeout(resetArmTimer);
    resetArmTimer = window.setTimeout(() => {
      confirmReset.value = false;
    }, 4000);
    return;
  }
  clearTimeout(resetArmTimer);
  confirmReset.value = false;
  timeAction('reset', 0);
}

function emitSettings(): void {
  saveSettings({ ...s });
  const colors = resolveColors(s);
  if (isDesktop) {
    emitTauri('visual-settings', {
      bodyScale: s.bodyScale,
      brightness: s.brightness,
      pointScale: s.pointScale,
      theme: s.theme,
      hue: s.hue,
      colors,
    });
    emitTauri('desktop-position', { x: s.positionX, y: s.positionY });
  }
}

watch(s, () => emitSettings(), { deep: true });
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
    } catch (error) { windowError.value = `窗口设置未生效：${String(error)}`; }
  });
}, { immediate: true });

const screenWidth = window.screen.width;
const screenHeight = window.screen.height;
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

function reset(): void {
  Object.assign(s, DEFAULT_SETTINGS);
  emitSettings();
}

function swatchColor(body: [number, number, number]): string {
  return `rgb(${body.map((c) => Math.round(c * 255)).join(',')})`;
}

/** 滑条已滑过比例 0–100%，驱动填充色。 */
function sliderFill(value: number, min: number, max: number): Record<string, string> {
  const pct = ((value - min) / (max - min)) * 100;
  return { '--fill': `${pct}%` };
}

onMounted(() => {
  void listenNative<{ vnow: string; scale: number; growth: ReturnType<LifeEngine['getGrowthSummary']> }>('clock-state', (c) => {
    vnow.value = c.vnow;
    currentScale.value = c.scale;
    growthInfo.value = c.growth;
  });
});

onBeforeUnmount(() => {
  clearTimeout(tapTimer);
  clearTimeout(resetArmTimer);
});
</script>

<template>
  <div class="page" :class="themeClass">
    <header class="top">
      <div class="top-copy">
        <h1>设置</h1>
        <p class="eyebrow">Emerge · Particle Life</p>
      </div>
      <div class="top-actions">
        <div class="segmented" role="group" aria-label="界面主题">
          <button
            v-for="opt in themeOptions"
            :key="opt.id"
            type="button"
            class="seg"
            :class="{ on: themeMode === opt.id }"
            :aria-pressed="themeMode === opt.id"
            @click="setTheme(opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
        <button type="button" class="btn-text" @click="reset">恢复默认</button>
      </div>
    </header>

    <section class="card">
      <h2>外观</h2>

      <div class="field">
        <div class="label-row">
          <label for="slider-body">粒子团大小</label>
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
          <label for="slider-brightness">亮度</label>
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
          <label for="slider-point">粒子点大小</label>
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
          <span id="swatch-label">配色</span>
        </div>
        <div class="swatches" role="listbox" aria-labelledby="swatch-label">
          <button
            v-for="t in COLOR_THEMES"
            :key="t.id"
            type="button"
            class="swatch"
            :class="{ on: s.theme === t.id }"
            :title="t.name"
            :aria-label="t.name"
            :aria-selected="s.theme === t.id"
            :style="{ background: swatchColor(t.body) }"
            @click="s.theme = t.id"
          />
          <button
            type="button"
            class="swatch custom"
            :class="{ on: s.theme === 'custom' }"
            title="自定义色相"
            aria-label="自定义色相"
            :aria-selected="s.theme === 'custom'"
            @click="s.theme = 'custom'"
          >
            <span class="hue-dot" />
          </button>
        </div>
      </div>

      <div v-if="s.theme === 'custom'" class="field">
        <div class="label-row">
          <label for="slider-hue">色相</label>
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

    <section class="card">
      <h2>行为</h2>
      <p v-if="windowError" role="alert" class="note error">
        <span aria-hidden="true">⚠</span> {{ windowError }}
      </p>

      <div class="toggle-row">
        <div class="toggle-copy">
          <strong>置顶显示</strong>
          <em>生命体保持在其它窗口之上</em>
        </div>
        <input
          id="toggle-topmost"
          v-model="s.topmost"
          type="checkbox"
          class="switch"
          aria-label="置顶显示"
        />
      </div>

      <div class="toggle-row">
        <div class="toggle-copy">
          <strong>鼠标穿透</strong>
          <em>开启后点击直达桌面；关闭后全屏透明主窗口接收点击</em>
        </div>
        <input
          id="toggle-clickthrough"
          v-model="s.clickthrough"
          type="checkbox"
          class="switch"
          aria-label="鼠标穿透"
        />
      </div>

      <p class="note plain">设置打开时，粒子层临时穿透且暂停鼠标响应；关闭设置后恢复此开关的选择。</p>
    </section>

    <section class="card">
      <h2>桌面位置</h2>
      <div class="placement-map" tabindex="0" role="group" aria-label="桌面位置预览，拖动或使用方向键移动"
        :style="{ aspectRatio: `${screenWidth} / ${screenHeight}` }"
        @pointerdown="startPlacement" @pointermove="movePlacement"
        @pointerup="placing = false" @pointercancel="placing = false" @lostpointercapture="placing = false"
        @keydown="keyPlacement">
        <span class="screen-label">桌面</span>
        <span class="placement-marker" :style="{ left: `${s.positionX * 100}%`, top: `${s.positionY * 100}%` }">✦</span>
      </div>
      <div class="placement-meta">
        <p class="note plain">拖动光点摆放，松手后固定停留；也可用方向键微调。</p>
        <p class="coord" aria-live="polite">{{ Math.round(s.positionX * 100) }}% · {{ Math.round(s.positionY * 100) }}%</p>
      </div>
    </section>

    <section class="card">
      <h2>成长</h2>

      <template v-if="growthInfo">
        <div class="growth-head">
          <div>
            <span class="stage-chip">{{ stageName }}</span>
            <p class="growth-pct">{{ (growthInfo.growth * 100).toFixed(1) }}%</p>
          </div>
          <div class="growth-meta">
            <p class="growth-sub">
              {{ Math.floor(growthInfo.companionMinutes) }} 分钟陪伴 ·
              {{ growthInfo.days }} 个使用日
            </p>
            <p v-if="growthInfo.lifeId" class="life-id">{{ growthInfo.lifeId }}</p>
          </div>
        </div>
        <div
          class="growth-progress"
          role="progressbar"
          aria-label="成长度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(growthInfo.growth * 100)"
        >
          <div class="growth-progress-fill" :style="{ width: `${growthInfo.growth * 100}%` }" />
        </div>

        <div class="stat-grid">
          <div class="stat">
            <span class="stat-label">陪伴</span>
            <strong>{{ Math.floor(growthInfo.companionMinutes) }} 分钟</strong>
          </div>
          <div class="stat">
            <span class="stat-label">使用日</span>
            <strong>{{ growthInfo.days }} 天</strong>
          </div>
          <div class="stat">
            <span class="stat-label">温和互动</span>
            <strong>{{ growthInfo.interactionMinutes.toFixed(1) }} 分钟</strong>
          </div>
          <div class="stat">
            <span class="stat-label">有效音乐</span>
            <strong>{{ growthInfo.musicMinutes.toFixed(1) }} 分钟</strong>
          </div>
        </div>
      </template>
      <p v-else class="note plain">等待生命体同步成长记录…</p>

      <div class="stage-path" aria-label="成长阶段">
        <div
          v-for="(st, i) in STAGES"
          :key="st.id"
          class="stage-node"
          :class="{ on: growthInfo ? i <= stageIndex : false, now: growthInfo ? i === stageIndex : false }"
        >
          <div class="stage-track">
            <span class="stage-dot" />
          </div>
          <div class="stage-name">{{ st.name }}</div>
          <div class="stage-range">{{ st.range }}</div>
        </div>
      </div>
      <ul class="stage-legend">
        <li v-for="st in STAGES" :key="st.id">
          <strong>{{ st.name }}</strong>
          <span>{{ st.desc }}</span>
        </li>
      </ul>
    </section>

    <section class="card">
      <h2>怎么积累</h2>
      <ul class="path-list">
        <li v-for="p in PATHS" :key="p.name">
          <strong>{{ p.name }}</strong>
          <span>{{ p.desc }}</span>
        </li>
      </ul>
      <p class="note plain">
        成长度由三条路径共同推进，只进不退。DNA 只影响成长速度，不限制最终上限。
        每日递减后仍会继续累计，只是变慢。
      </p>
    </section>

    <section v-if="timeUnlocked" class="card time-card">
      <h2>时间加速</h2>

      <div class="field">
        <div class="label-row">
          <span>虚拟时间</span>
          <span class="vnow" aria-live="polite">{{ vnow }}（×{{ currentScale }}）</span>
        </div>
        <div class="pills">
          <button
            v-for="n in scales"
            :key="n"
            type="button"
            class="pill"
            :class="{ on: currentScale === n }"
            :aria-pressed="currentScale === n"
            @click="applyScale(n)"
          >
            ×{{ n }}
          </button>
        </div>
      </div>

      <div class="pills actions">
        <button type="button" class="pill" @click="timeAction('advance', 1)">+1 天</button>
        <button type="button" class="pill" @click="timeAction('interaction', 60)">
          +60 分钟互动
        </button>
        <button type="button" class="pill" @click="timeAction('absence', 3)">
          模拟离开 3 天
        </button>
        <button
          type="button"
          class="pill danger"
          :class="{ armed: confirmReset }"
          :title="confirmReset ? undefined : '清空成长记录，重新开始'"
          @click="onResetLife"
        >
          {{ confirmReset ? '确认重置生命？' : '重置生命' }}
        </button>
      </div>
      <p v-if="lastAction" role="status" class="note ok">{{ lastAction }} ✓</p>
      <p v-else class="note plain">用于快速观察成长、昼夜与离线回归。</p>
    </section>

    <p
      class="footer-hint"
      :class="{ lit: titleLit }"
      :style="titleLit ? { opacity: 0.7 + titleLit * 0.05 } : undefined"
      title="连点 5 次解锁时间加速"
      @click="onSecretTap"
    >
      关闭本窗口不会退出应用 · 托盘菜单仍可控制
    </p>
  </div>
</template>

<style scoped>
/* ===== Design Tokens：Claude 风格规范（浅色默认，深色见下方覆盖） ===== */
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
  --accent-text: #c6613f;
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
  margin: 0;
  padding: 24px 20px 32px;
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
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex: 0 0 auto;
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

/* 分段控件：灰底轨道 + 选中白底轻边框 */
.segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  gap: 2px;
}

.seg {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: 12px/18px var(--font-ui);
  padding: 4px 10px;
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

/* ===== 卡片：白底 + 1px 边框 + 圆角 12，无阴影，悬停边框加深 ===== */
.card {
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

.vnow {
  font-size: 13px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
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
  text-align: center;
  min-width: 0;
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
  margin-top: 1px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.stage-legend,
.path-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.stage-legend li,
.path-list li {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  font-size: 13px;
  line-height: 20px;
}

.stage-legend li:first-child,
.path-list li:first-child {
  border-top: none;
  padding-top: 2px;
}

.stage-legend strong,
.path-list strong {
  font-weight: 500;
  color: var(--text-primary);
}

.stage-legend span,
.path-list span {
  color: var(--text-secondary);
}

.path-list li {
  grid-template-columns: 56px 1fr;
}

/* ===== 时间加速（隐藏功能卡：样式与普通卡片一致，克制装饰） ===== */
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 4px;
}
.pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: 12px/18px var(--font-ui);
  cursor: pointer;
  transition:
    background 0.14s var(--ease),
    border-color 0.14s var(--ease),
    color 0.14s var(--ease),
    transform 0.12s var(--ease);
}
.pill:hover {
  border-color: var(--border-strong);
  background: var(--bg-sunken);
}
.pill:active {
  transform: scale(0.98);
}
/* 选中态：浅橙底 + 橙色文字，不整行填充（规范：橙色面积克制） */
.pill.on {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent-text);
  font-weight: 600;
}
.pill.danger {
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  color: var(--danger);
}
.pill.danger:hover {
  background: var(--danger-soft);
  border-color: var(--danger);
}
.pill.danger.armed {
  background: var(--danger);
  border-color: var(--danger);
  color: #ffffff;
  font-weight: 600;
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
  color: #d97757;
  font-size: 24px;
  line-height: 1;
  text-shadow: 0 0 12px rgba(217, 119, 87, 0.45);
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
</style>
