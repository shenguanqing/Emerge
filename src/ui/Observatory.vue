<script setup lang="ts">
/**
 * 观察空间：暗色沉浸层，生命体居中可旋转缩放。
 * 信息只占边缘少量空间，不做成卡片仪表盘。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { stageDisplayName, t } from '../i18n';
import type { LifeState } from '../core/types';
import {
  clampCamera,
  DEFAULT_CAMERA,
  MAX_DIST,
  MIN_DIST,
  type OrbitCamera,
  dragCamera,
} from '../render/ViewState';

const props = defineProps<{
  state: LifeState | null;
  growth: {
    lifeId: string;
    growth: number;
    companionMinutes: number;
    interactionMinutes: number;
    musicMinutes: number;
    days: number;
    musicAffinity: number;
    trust: number;
  } | null;
  dna: {
    id: string;
    symmetry: number;
    curiosityBase: number;
    energyBase: number;
    growthBias: number;
    orbitBias: number;
  } | null;
  /** 打开时的初始相机；不传则用默认。 */
  initial?: OrbitCamera;
  insets?: { top: number; right: number; bottom: number; left: number };
}>();

const emit = defineEmits<{
  close: [];
  view: [OrbitCamera];
}>();

const view = ref<OrbitCamera>({ ...(props.initial ?? DEFAULT_CAMERA) });
const dragging = ref(false);
let lastX = 0;
let lastY = 0;

/** 手机窄屏默认收起侧栏，把画面留给可拖拽的生命体；桌面不显示手柄。 */
const railToggleable = window.matchMedia('(max-width: 640px)').matches;
const railCollapsed = ref(railToggleable);
/** 提示文案按平台分支：手机没有滚轮/方向键。 */
const isNarrow = railToggleable;

const stageLabel = computed(() => {
  const s = props.state?.stage;
  if (!s) return '—';
  return stageDisplayName(s);
});

const moodLabel = computed(() => {
  const s = props.state;
  if (!s) return '—';
  if (s.scared > 0.55) return t('diag.mood.scared');
  if (s.curious > 0.55) return t('diag.mood.curious');
  if (s.sleepiness > 0.6) return t('diag.mood.sleepy');
  if (s.calm > 0.6) return t('diag.mood.calm');
  return t('diag.mood.alert');
});

const energyPct = computed(() => Math.round((props.state?.energy ?? 0) * 100));
const trustPct = computed(() => Math.round((props.growth?.trust ?? 0) * 100));
const growthPct = computed(() => Math.round((props.state?.growth ?? 0) * 100));

function pushView(): void {
  emit('view', { ...view.value });
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  dismissTip();
  const next = clampCamera({
    ...view.value,
    distance: view.value.distance * (e.deltaY > 0 ? 1.05 : 0.95),
  });
  view.value = next;
  pushView();
}

/** 双指捏合缩放：活动指针表 + 指距变化映射相机距离（与滚轮同一钳制）。 */
const activePointers = new Map<number, { x: number; y: number }>();
let pinchDist = 0;

function onDown(e: PointerEvent): void {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size >= 2) {
    // 进入捏合：记录指距并暂停单指旋转。
    const [a, b] = [...activePointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    dragging.value = false;
    dismissTip();
    return;
  }
  dragging.value = true;
  lastX = e.clientX;
  lastY = e.clientY;
  try {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    // 合成事件或指针已释放时可能失败，不影响拖动。
  }
}

function onMove(e: PointerEvent): void {
  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size >= 2) {
    const [a, b] = [...activePointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && dist > 0) {
      view.value = clampCamera({ ...view.value, distance: view.value.distance * (pinchDist / dist) });
      pushView();
    }
    pinchDist = dist;
    return;
  }
  if (!dragging.value) return;
  dismissTip();
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  // 降低灵敏度：桌面触控板/高分屏拖动不易甩飞。
  view.value = dragCamera(view.value, dx, dy);
  pushView();
}

function onUp(e?: PointerEvent): void {
  if (e) activePointers.delete(e.pointerId); else activePointers.clear();
  if (activePointers.size >= 2) return;
  pinchDist = 0;
  if (activePointers.size === 1) {
    // 捏合回到单指：以剩余指针位置重启旋转，视角不跳变。
    const [p] = [...activePointers.values()];
    lastX = p.x;
    lastY = p.y;
    dragging.value = true;
    return;
  }
  dragging.value = false;
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if ((e.target as HTMLElement)?.closest('button, input, select, textarea')) return;
  const step = 0.08;
  if (e.key === 'ArrowLeft') view.value = { ...view.value, azimuth: view.value.azimuth - step };
  else if (e.key === 'ArrowRight') view.value = { ...view.value, azimuth: view.value.azimuth + step };
  else if (e.key === 'ArrowUp') view.value = clampCamera({ ...view.value, elevation: view.value.elevation + step * 0.55 });
  else if (e.key === 'ArrowDown') view.value = clampCamera({ ...view.value, elevation: view.value.elevation - step * 0.55 });
  else if (e.key === '+' || e.key === '=') view.value = clampCamera({ ...view.value, distance: view.value.distance * 0.95 });
  else if (e.key === '-' || e.key === '_') view.value = clampCamera({ ...view.value, distance: view.value.distance * 1.05 });
  else return;
  e.preventDefault();
  dismissTip();
  pushView();
}

function resetView(): void {
  view.value = { ...(props.initial ?? DEFAULT_CAMERA) };
  pushView();
}

/** 首访提示：按设备只教一次；拖动 / 滚轮 / 缩放键 / 知道了 / 关闭任一路径都算看过。 */
const TIP_SEEN_KEY = 'emerge.ui.obsTipSeen';
const firstTip = ref(false);
let tipShownThisOpen = false;
function dismissTip(): void {
  if (!firstTip.value) return;
  firstTip.value = false;
  try { localStorage.setItem(TIP_SEEN_KEY, '1'); } catch { /* 存储不可用时本次会话内不再显示 */ }
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  pushView();
  let seen = false;
  try { seen = localStorage.getItem(TIP_SEEN_KEY) === '1'; } catch { /* 按未见处理 */ }
  if (!seen) { firstTip.value = true; tipShownThisOpen = true; }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
  if (tipShownThisOpen) dismissTip();
});

defineExpose({
  getCamera: () => ({ ...view.value }),
  reset: resetView,
  zoomRange: { min: MIN_DIST, max: MAX_DIST },
});
</script>

<template>
  <div class="obs" :style="{ '--native-top': `${insets?.top ?? 0}px`, '--native-right': `${insets?.right ?? 0}px`, '--native-bottom': `${insets?.bottom ?? 0}px`, '--native-left': `${insets?.left ?? 0}px` }" role="dialog" :aria-label="t('obs.aria')">
    <div
      class="obs-veil"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp($event)"
      @pointercancel="onUp($event)"
      @dblclick.stop="emit('close')"
      @wheel="onWheel"
    />

    <aside class="obs-rail" :class="{ 'is-collapsed': railCollapsed }">
      <button
        v-if="railToggleable"
        class="obs-rail-handle"
        type="button"
        :aria-label="t('obs.rail.collapse')"
        @click="railCollapsed = true"
      >›</button>
      <header class="obs-head">
        <div>
          <p class="obs-kicker">{{ t('obs.kicker') }}</p>
          <h1 class="obs-title">{{ t('obs.title') }}</h1>
        </div>
        <button class="obs-close" type="button" :aria-label="t('obs.ariaClose')" @click="emit('close')">
          {{ t('obs.close') }}
        </button>
      </header>

      <dl class="obs-stats">
        <div class="obs-row">
          <dt>{{ t('obs.days') }}</dt>
          <dd>{{ growth?.days ?? 0 }} {{ t('unit.days') }}</dd>
        </div>
        <div class="obs-row">
          <dt>{{ t('obs.mood') }}</dt>
          <dd>{{ moodLabel }}</dd>
        </div>
        <div class="obs-row">
          <dt>{{ t('obs.energy') }}</dt>
          <dd>
            <span class="obs-bar" aria-hidden="true"><i :style="{ width: `${energyPct}%` }" /></span>
            {{ energyPct }}%
          </dd>
        </div>
        <div class="obs-row">
          <dt>{{ t('obs.trust') }}</dt>
          <dd>
            <span class="obs-bar" aria-hidden="true"><i :style="{ width: `${trustPct}%` }" /></span>
            {{ trustPct }}%
          </dd>
        </div>
      </dl>

      <section class="obs-block">
        <h2>DNA</h2>
        <p class="obs-id">{{ dna?.id ?? state?.lifeId ?? '—' }}</p>
        <ul class="obs-dna">
          <li><span>{{ t('dna.symmetry') }}</span><b>{{ Math.round((dna?.symmetry ?? 0) * 100) }}%</b></li>
          <li><span>{{ t('dna.curiosity') }}</span><b>{{ Math.round((dna?.curiosityBase ?? 0) * 100) }}%</b></li>
          <li><span>{{ t('dna.energy') }}</span><b>{{ Math.round((dna?.energyBase ?? 0) * 100) }}%</b></li>
          <li><span>{{ t('dna.growth') }}</span><b>{{ Math.round((dna?.growthBias ?? 0) * 100) }}%</b></li>
          <li><span>{{ t('dna.vortex') }}</span><b>{{ Math.round((dna?.orbitBias ?? 0) * 100) }}%</b></li>
        </ul>
      </section>

      <section class="obs-block">
        <h2>{{ t('obs.evolution') }}</h2>
        <p class="obs-evo">
          <strong>{{ growthPct }}%</strong>
          <span>{{ stageLabel }}</span>
        </p>
        <p class="obs-sub">
          {{ t('obs.orbits') }} {{ state?.form.orbitCount ?? 2 }} ·
          {{ t('obs.neural') }} {{ Math.round((state?.form.neural ?? 0) * 100) }}% ·
          {{ t('obs.arc') }} {{ Math.round((state?.form.streamArc ?? 0) * 100) }}%
        </p>
        <p class="obs-sub">
          {{ t('obs.companionLine', { m: Math.floor(growth?.companionMinutes ?? 0), d: growth?.days ?? 0 }) }}
        </p>
      </section>

      <div id="observatory-music" />

      <footer class="obs-foot">
        <button class="obs-reset" type="button" @click="resetView">{{ t('obs.reset') }}</button>
        <p class="obs-hint">{{ t(isNarrow ? 'obs.hintMobile' : 'obs.hint') }}</p>
      </footer>
    </aside>

    <!-- 手机收纳态：右上角单按钮展开侧栏（与主页面顶部按钮同款语言） -->
    <Transition name="obs-tip">
      <button
        v-if="railToggleable && railCollapsed"
        class="obs-rail-fab"
        type="button"
        :aria-label="t('obs.rail.expand')"
        @click="railCollapsed = false"
      >‹</button>
    </Transition>

    <Transition name="obs-tip">
      <div v-if="firstTip" class="obs-tip">
        <ul class="obs-tip-list">
          <li><b>{{ t('obs.first.drag') }}</b><span>{{ t('obs.first.dragDesc') }}</span></li>
          <li><b>{{ t('obs.first.zoom') }}</b><span>{{ t('obs.first.zoomDesc') }}</span></li>
          <li><b>{{ t('obs.first.exit') }}</b><span>{{ t('obs.first.exitDesc') }}</span></li>
        </ul>
        <button class="obs-tip-ok" type="button" @click="dismissTip">{{ t('obs.first.ok') }}</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.obs {
  --obs-top: max(env(safe-area-inset-top, 0px), var(--native-top, 0px));
  --obs-bottom: max(env(safe-area-inset-bottom, 0px), var(--native-bottom, 0px));
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  pointer-events: none;
  color: #f2f0ea;
  font-family: var(--font-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif);
}

.obs-veil {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: grab;
  /* 手势归观察空间：双指捏合缩放不走浏览器页面缩放 */
  touch-action: none;
  /* 不加压暗遮罩：保持粒子原有亮度，只作拖拽热区。 */
  background: transparent;
}

.obs-veil:active {
  cursor: grabbing;
}

.obs-rail {
  position: relative;
  pointer-events: auto;
  width: min(300px, calc(100vw - 40px - var(--native-right) - var(--native-left)));
  margin: calc(20px + var(--obs-top)) calc(20px + var(--native-right)) calc(20px + var(--obs-bottom)) 0;
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: rgba(14, 14, 16, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: calc(100vh - 40px - var(--obs-top) - var(--obs-bottom));
  max-height: calc(100dvh - 40px - var(--obs-top) - var(--obs-bottom));
  overflow: auto;
  box-sizing: border-box;
}

/* 手机收纳手柄：贴在侧栏左缘，收起后仍留在屏幕内 */
.obs-rail-handle {
  position: absolute;
  left: -13px;
  top: 14px;
  z-index: 1;
  width: 26px;
  height: 26px;
  display: none;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 50%;
  background: rgba(14, 14, 16, 0.85);
  color: rgba(242, 240, 234, 0.75);
  font: 14px/1 var(--font-ui, system-ui, sans-serif);
  cursor: pointer;
}
.obs-rail-handle:hover {
  color: #eba085;
  border-color: rgba(224, 138, 107, 0.6);
}

@media (max-width: 640px) {
  .obs-rail {
    transition: transform 0.28s cubic-bezier(0.2, 0, 0, 1), opacity 0.24s ease;
  }
  .obs-rail-handle {
    display: grid;
  }
  /* 收起态：侧栏整体滑出屏幕，右上角只留一枚圆形展开按钮 */
  .obs-rail.is-collapsed {
    transform: translateX(115%);
    opacity: 0;
    pointer-events: none;
  }
  /* 展开按钮：与主页面顶部第一个按钮（设置）同一位置 */
  .obs-rail-fab {
    position: absolute;
    top: calc(14px + env(safe-area-inset-top, 0px));
    right: calc(14px + env(safe-area-inset-right, 0px));
    z-index: 1;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 50%;
    background: rgba(14, 14, 16, 0.72);
    color: rgba(242, 240, 234, 0.78);
    font: 14px/1 var(--font-ui, system-ui, sans-serif);
    cursor: pointer;
    pointer-events: auto;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
  }
  .obs-rail-fab:hover {
    border-color: rgba(224, 138, 107, 0.6);
    color: #eba085;
  }
  @media (prefers-reduced-motion: reduce) {
    .obs-rail {
      transition-duration: 0.01ms;
    }
  }
}

.obs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.obs-kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(242, 240, 234, 0.45);
}

.obs-title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.obs-close,
.obs-reset {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f2f0ea;
  border-radius: 8px;
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  cursor: pointer;
}

.obs-close:hover,
.obs-reset:hover {
  background: rgba(255, 255, 255, 0.12);
}

.obs-stats {
  margin: 0;
  display: grid;
  gap: 10px;
}

.obs-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}

.obs-row dt {
  color: rgba(242, 240, 234, 0.5);
  margin: 0;
}

.obs-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.obs-bar {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.obs-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #c4a574, #e8d5a8);
  border-radius: inherit;
}

.obs-block h2 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(242, 240, 234, 0.45);
  text-transform: uppercase;
}

.obs-id {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: #e8d5a8;
  font-variant-numeric: tabular-nums;
}

.obs-dna {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.obs-dna li {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(242, 240, 234, 0.55);
}

.obs-dna b {
  font-weight: 500;
  color: #f2f0ea;
  font-variant-numeric: tabular-nums;
}

.obs-evo {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.obs-evo strong {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.obs-evo span {
  font-size: 13px;
  color: rgba(242, 240, 234, 0.55);
}

.obs-sub {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(242, 240, 234, 0.45);
  line-height: 1.5;
}

.obs-foot {
  margin-top: auto;
  display: grid;
  gap: 10px;
}

.obs-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: rgba(242, 240, 234, 0.38);
}

/* ===== 首访提示：左下角玻璃卡，pointer-events 全关（按钮除外），不挡拖拽热区 ===== */
.obs-tip {
  position: absolute;
  left: calc(20px + var(--native-left, 0px));
  bottom: calc(20px + var(--obs-bottom));
  z-index: 1;
  pointer-events: none;
  display: grid;
  justify-items: start;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(14, 14, 16, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  max-width: min(300px, calc(100vw - 40px - var(--native-left, 0px)));
  box-sizing: border-box;
}

.obs-tip-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.obs-tip-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-size: 13px;
  line-height: 20px;
}

.obs-tip-list b {
  font-weight: 600;
  color: #f2f0ea;
  white-space: nowrap;
}

.obs-tip-list span {
  color: rgba(242, 240, 234, 0.55);
  text-align: right;
}

.obs-tip-ok {
  pointer-events: auto;
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f2f0ea;
  border-radius: 8px;
  height: 32px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
}

.obs-tip-ok:hover {
  background: rgba(255, 255, 255, 0.12);
}

.obs-tip-enter-active,
.obs-tip-leave-active {
  transition:
    opacity 0.24s cubic-bezier(0.2, 0, 0, 1),
    transform 0.24s cubic-bezier(0.2, 0, 0, 1);
}

.obs-tip-enter-from,
.obs-tip-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .obs-tip-enter-active,
  .obs-tip-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
