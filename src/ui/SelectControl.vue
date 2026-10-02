<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  id: string;
  modelValue: T;
  options: ReadonlyArray<{ id: T; label: string }>;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const open = ref(false);
const active = ref(0);
const popupStyle = ref<Record<string, string>>({});
const selected = computed(() => props.options.find((option) => option.id === props.modelValue));
const listId = computed(() => `${props.id}-list`);
let query = '';
let queryTimer = 0;

function positionMenu(): void {
  const button = trigger.value;
  const list = menu.value;
  if (!button || !list) return;
  const box = button.getBoundingClientRect();
  const gap = 6;
  const padding = 8;
  const below = window.innerHeight - box.bottom - gap - padding;
  const above = box.top - gap - padding;
  const height = list.scrollHeight;
  const placeBelow = below >= height || below >= above;
  const maxHeight = Math.max(0, placeBelow ? below : above);
  const width = Math.min(Math.max(box.width, 176), window.innerWidth - padding * 2);
  popupStyle.value = {
    width: `${width}px`,
    left: `${Math.max(padding, Math.min(box.right - width, window.innerWidth - width - padding))}px`,
    top: `${placeBelow ? box.bottom + gap : Math.max(padding, box.top - gap - Math.min(height, maxHeight))}px`,
    maxHeight: `${maxHeight}px`,
  };
}

async function show(index?: number): Promise<void> {
  active.value = index ?? Math.max(0, props.options.findIndex((option) => option.id === props.modelValue));
  open.value = true;
  await nextTick();
  positionMenu();
  await nextTick();
  revealActive();
}
function close(): void {
  open.value = false;
  query = '';
  clearTimeout(queryTimer);
}
function revealActive(): void {
  menu.value?.children[active.value]?.scrollIntoView({ block: 'nearest' });
}
function choose(index: number): void {
  const option = props.options[index];
  if (!option) return;
  emit('update:modelValue', option.id);
  close();
  trigger.value?.focus({ preventScroll: true });
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Tab') { close(); return; }
  if (event.key === 'Escape') {
    if (open.value) { event.preventDefault(); event.stopPropagation(); close(); }
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open.value) choose(active.value);
    else void show();
    return;
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (!open.value) {
      void show(event.key === 'Home' ? 0 : event.key === 'End' ? props.options.length - 1 : undefined);
    } else {
      const last = props.options.length - 1;
      active.value = event.key === 'Home' ? 0 : event.key === 'End' ? last
        : Math.max(0, Math.min(last, active.value + (event.key === 'ArrowDown' ? 1 : -1)));
      revealActive();
    }
    return;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    clearTimeout(queryTimer);
    query += event.key.toLocaleLowerCase();
    queryTimer = window.setTimeout(() => { query = ''; }, 700);
    const index = props.options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(query));
    if (index >= 0) {
      if (!open.value) void show(index);
      else { active.value = index; revealActive(); }
    }
  }
}
function onOutside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) close();
}
function onBlur(event: FocusEvent): void {
  if (!root.value?.contains(event.relatedTarget as Node | null)) close();
}
function onScroll(event: Event): void {
  if (!menu.value?.contains(event.target as Node)) close();
}
watch(() => props.options, async () => {
  if (open.value) { await nextTick(); positionMenu(); }
});
onMounted(() => {
  document.addEventListener('pointerdown', onOutside);
  window.addEventListener('resize', close);
  window.addEventListener('scroll', onScroll, true);
});
onBeforeUnmount(() => {
  close();
  document.removeEventListener('pointerdown', onOutside);
  window.removeEventListener('resize', close);
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <div ref="root" class="select-control" @focusout="onBlur">
    <button
      :id="id"
      ref="trigger"
      type="button"
      class="select-trigger"
      :class="{ expanded: open }"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open ? `${id}-option-${active}` : undefined"
      :aria-labelledby="`${id}-label`"
      @click="open ? close() : show()"
      @keydown="onKey"
    >
      <span>{{ selected?.label }}</span>
      <svg class="chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="m4.5 6.5 3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div
      v-if="open"
      :id="listId"
      ref="menu"
      role="listbox"
      class="select-menu"
      :aria-labelledby="`${id}-label`"
      :style="popupStyle"
    >
      <div
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="option.id"
        role="option"
        class="select-option"
        :class="{ active: index === active, selected: option.id === modelValue }"
        :aria-selected="option.id === modelValue"
        @pointermove="active = index"
        @pointerdown.prevent
        @click="choose(index)"
      >
        <span>{{ option.label }}</span>
        <svg v-if="option.id === modelValue" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.select-control { width: 160px; max-width: 100%; min-width: 0; }
.select-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; min-height: 32px; padding: 5px 12px;
  border: 1px solid var(--border-subtle); border-radius: 8px;
  background: var(--bg-page); color: var(--text-primary);
  font: 13px/20px var(--font-ui); text-align: left; cursor: pointer;
  transition: background .14s var(--ease), border-color .14s var(--ease);
}
.select-trigger:hover, .select-trigger.expanded { background: var(--bg-sunken); border-color: var(--border-strong); }
.select-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.chevron { width: 16px; height: 16px; flex: none; color: var(--text-secondary); transition: transform .14s var(--ease); }
.expanded .chevron { transform: rotate(180deg); }
.select-menu {
  position: fixed; z-index: 100; box-sizing: border-box; padding: 5px;
  overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid var(--border-subtle); border-radius: 10px;
  background: var(--bg-surface); color: var(--text-primary);
  box-shadow: var(--shadow-pop); font: 13px/20px var(--font-ui);
}
.select-option {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 32px; box-sizing: border-box; padding: 6px 10px;
  border-radius: 6px; cursor: pointer;
}
.select-option.active { background: var(--bg-sunken); }
.select-option.selected { font-weight: 500; }
.select-option svg { width: 16px; height: 16px; flex: none; color: var(--accent-text); }
@media (prefers-reduced-motion: reduce) {
  .select-trigger, .chevron { transition: none; }
}
</style>
