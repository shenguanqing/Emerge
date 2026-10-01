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
  const next = clampCamera({
    ...view.value,
    distance: view.value.distance * (e.deltaY > 0 ? 1.05 : 0.95),
  });
  view.value = next;
  pushView();
}

function onDown(e: PointerEvent): void {
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
  if (!dragging.value) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  // 降低灵敏度：桌面触控板/高分屏拖动不易甩飞。
  view.value = clampCamera({
    ...view.value,
    azimuth: view.value.azimuth - dx * 0.0035,
    elevation: view.value.elevation + dy * 0.0028,
  });
  pushView();
}

function onUp(): void {
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
  pushView();
}

function resetView(): void {
  view.value = { ...(props.initial ?? DEFAULT_CAMERA) };
  pushView();
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  pushView();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
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
      @pointerup="onUp"
      @pointercancel="onUp"
      @dblclick.stop="emit('close')"
      @wheel="onWheel"
    />

    <aside class="obs-rail">
      <header class="obs-head">
        <div>
          <p class="obs-kicker">OBSERVATORY</p>
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
        <h2>Evolution</h2>
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
        <p class="obs-hint">{{ t('obs.hint') }}</p>
      </footer>
    </aside>
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
</style>
