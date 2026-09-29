<script setup lang="ts">
/**
 * 调试面板（仅 ?debug=1 显示）：时间加速与生命状态的一键操作。
 * 通过 window 上的调试句柄操作生命时钟与记忆，不触碰核心引擎内部。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

const w = window as typeof window & {
  __emergeClock?: {
    now(): number;
    advance(ms: number): void;
    scale: number;
    date(): Date;
  };
  __emergeMemory?: { state: { interactionMinutes: number; daysSeen: string[] } };
};

const vnow = ref('');
let timer = 0;
onMounted(() => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const tick = () => {
    const d = w.__emergeClock?.date();
    if (d) {
      vnow.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  };
  tick();
  timer = window.setInterval(tick, 1000);
});
onBeforeUnmount(() => clearInterval(timer));

function forwardDays(n: number): void {
  w.__emergeClock?.advance(n * 86400000);
}
function addInteractionMinutes(n: number): void {
  const m = w.__emergeMemory;
  if (m) m.state.interactionMinutes += n;
}
function simulateAbsence(days: number): void {
  w.__emergeClock?.advance(days * 86400000);
  // 离线问候由下次加载触发；本会话内直接以回归强度提醒引擎不可行（需重载），
  // 这里通过刷新携带参数实现。
  const url = new URL(window.location.href);
  url.searchParams.set('offline', String(days * 1440));
  window.location.href = url.toString();
}
function resetLife(): void {
  localStorage.removeItem('emerge.life.v1');
  window.location.reload();
}
</script>

<template>
  <div class="dbg">
    <div class="row title">时间加速调试</div>
    <div class="row">虚拟时间 {{ vnow }}（×{{ w.__emergeClock?.scale ?? 1 }}）</div>
    <div class="btns">
      <button @click="forwardDays(1)">+1 天</button>
      <button @click="addInteractionMinutes(60)">+60 分钟互动</button>
      <button @click="simulateAbsence(3)">模拟离开 3 天</button>
      <button class="danger" @click="resetLife">重置生命</button>
    </div>
  </div>
</template>

<style scoped>
.dbg {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 8px 10px;
  border: 1px solid rgba(120, 160, 220, 0.25);
  border-radius: 6px;
  background: rgba(8, 12, 20, 0.72);
  font: 11px/1.7 ui-monospace, 'SF Mono', Menlo, monospace;
  color: rgba(210, 228, 255, 0.8);
  user-select: none;
}
.row.title {
  font-weight: 600;
  margin-bottom: 2px;
}
.btns {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
button {
  font: inherit;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(120, 160, 220, 0.35);
  background: rgba(20, 30, 48, 0.8);
  color: inherit;
  cursor: pointer;
}
button.danger {
  border-color: rgba(255, 120, 120, 0.4);
}
</style>
