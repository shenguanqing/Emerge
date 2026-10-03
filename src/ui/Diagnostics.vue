<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../i18n';

const props = defineProps<{
  backend: string;
  note: string;
  fps: number;
  particles: number;
  dpr: number;
  mood: string;
  quality: string;
  targetFps: number;
  life: string;
  /** bar：画面左下角横向芯片条；panel：弹层内纵向键值列表。 */
  layout?: 'bar' | 'panel';
}>();

const qualityLabel = computed(() => t(`tier.${props.quality}`) || props.quality);
const backendLabel = computed(() => props.backend === 'probing' ? t('diag.probing')
  : props.backend === 'none' ? t('diag.none') : props.backend === 'failed' ? t('note.initFailed') : props.backend);
const moodLabel = computed(() => props.mood === 'calm' ? t('diag.mood.calm') : props.mood);
const qualityValue = computed(() => `${qualityLabel.value} @ ${props.targetFps}fps`);
</script>

<template>
  <div v-if="layout === 'panel'" class="diag-panel" aria-live="polite">
    <div class="row">
      <span class="k">{{ t('diag.backend') }}</span>
      <span class="v">{{ backendLabel }}</span>
    </div>
    <div class="row">
      <span class="k">{{ t('obs.mood') }}</span>
      <span class="v">{{ moodLabel }}</span>
    </div>
    <div v-if="life" class="row">
      <span class="k">{{ t('diag.life') }}</span>
      <span class="v">{{ life }}</span>
    </div>
    <div class="row">
      <span class="k">FPS</span>
      <span class="v">{{ fps }}</span>
    </div>
    <div class="row">
      <span class="k">{{ t('diag.particles') }}</span>
      <span class="v">{{ particles.toLocaleString() }}</span>
    </div>
    <div class="row">
      <span class="k">{{ t('diag.quality') }}</span>
      <span class="v">{{ qualityValue }}</span>
    </div>
    <div class="row">
      <span class="k">DPR</span>
      <span class="v">{{ dpr.toFixed(2) }}</span>
    </div>
    <p v-if="note" class="note">{{ note }}</p>
  </div>
  <div v-else class="diag" aria-live="polite">
    <span class="chip">{{ t('diag.backend') }} {{ backendLabel }}</span>
    <span class="chip">{{ moodLabel }}</span>
    <span v-if="life" class="chip">{{ life }}</span>
    <span class="chip">{{ fps }} FPS</span>
    <span class="chip">{{ particles.toLocaleString() }} {{ t('diag.particles') }}</span>
    <span class="chip">{{ qualityLabel }} @ {{ targetFps }}fps</span>
    <span class="chip">DPR {{ dpr.toFixed(2) }}</span>
    <span v-if="note" class="note">{{ note }}</span>
  </div>
</template>

<style scoped>
.diag {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  font: 12px/1.6 ui-monospace, 'SF Mono', Menlo, monospace;
  color: rgba(210, 228, 255, 0.72);
  pointer-events: none;
  user-select: none;
}
.chip {
  padding: 2px 8px;
  border: 1px solid rgba(120, 160, 220, 0.25);
  border-radius: 4px;
  background: rgba(8, 12, 20, 0.55);
  white-space: nowrap;
}
.note {
  opacity: 0.6;
  white-space: nowrap;
}

/* 弹层内纵向键值列表：标签居左、数值右对齐 */
.diag-panel {
  font: 12px/1.6 ui-monospace, 'SF Mono', Menlo, monospace;
  color: rgba(210, 228, 255, 0.72);
  user-select: none;
}
.diag-panel .row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}
.diag-panel .row + .row {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.diag-panel .k {
  flex: 0 0 auto;
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: 11px;
  color: rgba(242, 240, 234, 0.5);
}
.diag-panel .v {
  min-width: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.diag-panel .note {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-family: var(--font-ui, system-ui, sans-serif);
  font-size: 11px;
  line-height: 1.6;
  color: rgba(242, 240, 234, 0.45);
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
