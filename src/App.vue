<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { DEFAULT_LIFE_PARAMS } from './core/types';
import { LifeEngine } from './core/LifeEngine';
import { WebGL2Backend } from './render/backends/WebGL2Backend';
import { probeCapabilities } from './render/capability';
import { PointerSystem } from './input/PointerSystem';
import Diagnostics from './ui/Diagnostics.vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const diag = reactive({
  backend: '探测中…',
  note: '',
  fps: 0,
  particles: DEFAULT_LIFE_PARAMS.particleCount,
  dpr: 1,
});

let engine: LifeEngine | null = null;
let backend: WebGL2Backend | null = null;
let pointer: PointerSystem | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;
let lastTime = 0;
let fpsWindow = 0;
let fpsFrames = 0;

function resize(): void {
  const canvas = canvasRef.value;
  if (!canvas || !backend) return;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  backend.resize(w, h, dpr);
  diag.dpr = dpr;
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const caps = await probeCapabilities();
  diag.backend = caps.chosen === 'webgl2' ? 'WebGL2' : caps.chosen;
  diag.note = caps.note;

  engine = new LifeEngine(DEFAULT_LIFE_PARAMS);
  pointer = new PointerSystem();
  pointer.attach(canvas);

  if (caps.chosen !== 'webgl2') {
    diag.note = `${caps.note}（当前仅显示诊断信息）`;
    return;
  }

  const lifeEngine = engine;
  const renderer = new WebGL2Backend(canvas, DEFAULT_LIFE_PARAMS);
  backend = renderer;

  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  lastTime = performance.now();
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop);
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // FPS：0.5s 滑动窗口平均。
    fpsWindow += dt;
    fpsFrames += 1;
    if (fpsWindow >= 0.5) {
      diag.fps = Math.round(fpsFrames / fpsWindow);
      fpsWindow = 0;
      fpsFrames = 0;
    }

    lifeEngine.update(dt);
    renderer.render(lifeEngine.getState());
  };
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  pointer?.dispose();
  backend?.dispose();
  engine = null;
  backend = null;
  pointer = null;
});
</script>

<template>
  <main class="stage">
    <canvas ref="canvasRef" class="stage-canvas"></canvas>
    <Diagnostics
      :backend="diag.backend"
      :note="diag.note"
      :fps="diag.fps"
      :particles="diag.particles"
      :dpr="diag.dpr"
    />
  </main>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
.stage {
  position: fixed;
  inset: 0;
}
.stage-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
