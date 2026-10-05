<script lang="ts">
export type TimeControlCommand = {
  type: 'scale' | 'advance' | 'interaction' | 'absence' | 'reset';
  value: number;
};
</script>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { t } from '../i18n';

const props = defineProps<{
  vnow: string;
  scale: number;
  preview?: boolean;
  variant?: 'settings' | 'popover';
  notice?: string;
}>();
const emit = defineEmits<{ command: [command: TimeControlCommand] }>();
const scales = [1, 10, 100, 500, 2000];
const lastAction = ref(props.notice ?? '');
const confirmReset = ref(false);
let resetArmTimer = 0;

function action(type: TimeControlCommand['type'], value: number): void {
  const key = { scale: 'time.lastScale', advance: 'time.lastAdvance',
    interaction: 'time.lastInteraction', absence: 'time.lastAbsence', reset: 'time.lastReset' }[type];
  lastAction.value = t(key, { n: value });
  emit('command', { type, value });
}

function resetLife(): void {
  if (!confirmReset.value) {
    confirmReset.value = true;
    lastAction.value = '';
    clearTimeout(resetArmTimer);
    resetArmTimer = window.setTimeout(() => { confirmReset.value = false; }, 4000);
    return;
  }
  clearTimeout(resetArmTimer);
  confirmReset.value = false;
  action('reset', 0);
}
onBeforeUnmount(() => clearTimeout(resetArmTimer));
</script>

<template>
  <section class="time-controls" :class="variant" :aria-label="t('section.time')">
    <h2>{{ t('section.time') }}</h2>
    <p v-if="preview" class="preview-note">{{ t('time.previewHint') }}</p>
    <div class="clock">
      <div class="clock-copy">
        <span class="clock-label">{{ t('time.virtual') }}</span>
        <span class="clock-time" aria-live="polite">{{ vnow }}</span>
      </div>
      <span class="clock-scale">×{{ scale }}</span>
    </div>
    <div class="scales" role="group" :aria-label="t('time.virtual')">
      <button v-for="n in scales" :key="n" type="button" class="scale-btn"
        :class="{ on: scale === n }" :aria-pressed="scale === n" @click="action('scale', n)">×{{ n }}</button>
    </div>
    <div class="time-actions">
      <button type="button" @click="action('advance', 1)">{{ t('time.advance1') }}</button>
      <button type="button" @click="action('interaction', 60)">{{ t('time.interaction60') }}</button>
      <button type="button" @click="action('absence', 3)">{{ t('time.absence3') }}</button>
      <button type="button" class="danger" :class="{ armed: confirmReset }"
        :title="preview ? undefined : t('time.resetTitle')" @click="resetLife">
        {{ t(preview ? (confirmReset ? 'time.resetPreviewConfirm' : 'time.resetPreview') : (confirmReset ? 'time.resetConfirm' : 'time.reset')) }}
      </button>
    </div>
    <p v-if="lastAction" role="status" class="note ok">{{ lastAction }} ✓</p>
    <p v-else class="note">{{ t('time.hint') }}</p>
  </section>
</template>

<style scoped>
.time-controls {
  color: var(--text-primary);
  font: 13px/1.5 var(--font-ui, system-ui, sans-serif);
}

h2 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
}

.preview-note,
.note {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.note {
  margin: 10px 0 0;
}

.note.ok {
  color: var(--accent-text);
}

.clock {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: var(--bg-sunken);
}

.clock-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.clock-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary);
}

.clock-time {
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.clock-scale {
  flex: 0 0 auto;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: background .14s ease;
}

button:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}

.scales {
  display: flex;
  padding: 3px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg-sunken);
}

.scale-btn {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.scale-btn.on {
  background: var(--accent-soft);
  color: var(--accent-text);
  font-weight: 600;
}

.time-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.time-actions button {
  min-width: 0;
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: transparent;
  text-align: center;
}

.time-actions button:hover {
  background: var(--bg-sunken);
}

.time-actions .danger {
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
  color: var(--danger);
}

.time-actions .danger:hover {
  background: var(--danger-soft);
}

.time-actions .danger.armed {
  background: var(--danger);
  color: #fff;
  font-weight: 600;
}

.popover {
  --text-primary: rgba(242, 240, 234, .85);
  --text-secondary: rgba(242, 240, 234, .65);
  --text-tertiary: rgba(242, 240, 234, .5);
  --border-strong: rgba(255, 255, 255, .14);
  --bg-sunken: rgba(255, 255, 255, .04);
  --accent-soft: rgba(255, 220, 170, .12);
  --accent-text: #e8c49a;
  --danger: #dc8a83;
  --danger-soft: rgba(220, 138, 131, .1);
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, .07);
}

.popover h2 {
  font-size: 12px;
  margin-bottom: 8px;
}

.popover .clock-time {
  font: 12px/20px ui-monospace, 'SF Mono', Menlo, monospace;
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
