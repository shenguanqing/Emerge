<script setup lang="ts">
/**
 * 音乐控制（右上角小按钮）：用户选择音乐文件 → 生命体"听音乐"。
 * Bass → 身体脉冲；Beat → 核心能量波；高频 → 外围活跃；高能 → 兴奋。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { AudioSystem } from '../input/AudioSystem';

const emit = defineEmits<{ features: [payload: unknown] }>();

const audio = new AudioSystem();
// 调试句柄：自动化验证音乐检测链路。
(window as typeof window & { __emergeAudio?: AudioSystem }).__emergeAudio = audio;
const playing = ref(false);
const hasTrack = ref(false);
const level = ref(0);
let raf = 0;

function pick(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    await audio.attachFile(file);
    hasTrack.value = true;
    playing.value = true;
  };
  input.click();
}

function toggle(): void {
  if (!hasTrack.value) {
    pick();
    return;
  }
  audio.setPlaying(!playing.value);
  playing.value = !playing.value;
}

onMounted(() => {
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const f = audio.read(performance.now());
    level.value = f.energy;
    emit('features', f);
  };
  raf = requestAnimationFrame(loop);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  audio.detach();
});
</script>

<template>
  <button
    class="music"
    :class="{ on: playing }"
    :title="hasTrack ? (playing ? '暂停音乐' : '播放音乐') : '选择音乐文件'"
    @click="toggle"
  >
    {{ playing ? '♪ ♪' : '♪' }}
    <span v-if="playing" class="bar" :style="{ height: `${4 + level * 14}px` }"></span>
  </button>
</template>

<style scoped>
.music {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  padding: 6px 10px;
  border: 1px solid rgba(120, 160, 220, 0.25);
  border-radius: 6px;
  background: rgba(8, 12, 20, 0.55);
  color: rgba(210, 228, 255, 0.8);
  font: 13px ui-monospace, 'SF Mono', Menlo, monospace;
  cursor: pointer;
}
.music.on {
  color: rgba(160, 220, 255, 1);
  border-color: rgba(140, 200, 255, 0.5);
}
.bar {
  width: 3px;
  background: rgba(140, 200, 255, 0.9);
  transition: height 0.1s linear;
}
</style>
