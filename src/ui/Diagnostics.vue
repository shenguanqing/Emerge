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
}>();

const qualityLabel = computed(() => t(`tier.${props.quality}`) || props.quality);
const backendLabel = computed(() => props.backend === 'probing' ? t('diag.probing')
  : props.backend === 'none' ? t('diag.none') : props.backend === 'failed' ? t('note.initFailed') : props.backend);
const moodLabel = computed(() => props.mood === 'calm' ? t('diag.mood.calm') : props.mood);
const qualityValue = computed(() => `${qualityLabel.value} @ ${props.targetFps}fps`);
</script>

<template>
  <div class="diag-panel" aria-live="polite">
    <div class="cell">
      <span class="k">{{ t('diag.backend') }}</span>
      <span class="v">{{ backendLabel }}</span>
    </div>
    <div class="cell">
      <span class="k">FPS</span>
      <span class="v">{{ fps }}</span>
    </div>
    <div class="cell">
      <span class="k">{{ t('obs.mood') }}</span>
      <span class="v">{{ moodLabel }}</span>
    </div>
    <div class="cell">
      <span class="k">{{ t('diag.particles') }}</span>
      <span class="v">{{ particles.toLocaleString() }}</span>
    </div>
    <div class="cell">
      <span class="k">{{ t('diag.quality') }}</span>
      <span class="v">{{ qualityValue }}</span>
    </div>
    <div class="cell">
      <span class="k">DPR</span>
      <span class="v">{{ dpr.toFixed(2) }}</span>
    </div>
    <div v-if="life" class="cell wide">
      <span class="k">{{ t('diag.life') }}</span>
      <span class="v">{{ life }}</span>
    </div>
    <p v-if="note" class="note">{{ note }}</p>
  </div>
</template>

<style scoped>
/* 弹层内两列紧凑网格：标签在上、数值在下，生命行与备注通栏 */
.diag-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  font-family: var(--font-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif);
  color: rgba(210, 228, 255, 0.72);
  user-select: none;
}
.diag-panel .cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.diag-panel .cell.wide {
  grid-column: 1 / -1;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.diag-panel .k {
  font-size: 11px;
  line-height: 16px;
  color: rgba(242, 240, 234, 0.5);
}
.diag-panel .v {
  font: 12px/18px ui-monospace, 'SF Mono', Menlo, monospace;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.diag-panel .note {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 11px;
  line-height: 1.6;
  color: rgba(242, 240, 234, 0.45);
  overflow-wrap: anywhere;
}
</style>
