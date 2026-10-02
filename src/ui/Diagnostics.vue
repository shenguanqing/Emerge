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
</script>

<template>
  <div class="diag" aria-live="polite">
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
</style>
