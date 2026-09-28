<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  DEFAULT_LIFE_PARAMS,
  DEFAULT_SIMULATION_PARAMS,
} from './core/types';
import { LifeEngine } from './core/LifeEngine';
import { WebGL2Backend } from './render/backends/webgl2/WebGL2Backend';
import { WebGPUBackend } from './render/backends/webgpu/WebGPUBackend';
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

type Backend = WebGL2Backend | WebGPUBackend;

let engine: LifeEngine | null = null;
let backend: Backend | null = null;
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
  if (pointer) pointer.setViewport(w, h);
  diag.dpr = dpr;
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const caps = await probeCapabilities();

  // ?backend=webgpu|webgl2 可强制指定（用于分别验证两种后端）。
  const override = new URLSearchParams(window.location.search).get('backend');
  let backendId: 'webgpu' | 'webgl2' | 'none' = 'none';
  if (override === 'webgpu' || override === 'webgl2') {
    backendId = override;
  } else if (caps.webgpu.available) {
    backendId = 'webgpu';
  } else if (caps.webgl2.available) {
    backendId = 'webgl2';
  }

  engine = new LifeEngine(DEFAULT_LIFE_PARAMS);
  pointer = new PointerSystem();
  pointer.attach(canvas);

  let active: Backend | null = null;
  try {
    if (backendId === 'webgpu') {
      active = await WebGPUBackend.create(canvas, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS);
      if (!active) diag.note = 'WebGPU 初始化失败，尝试回退 WebGL2';
    }
    if (!active && (backendId === 'webgl2' || backendId === 'none') && caps.webgl2.available) {
      active = new WebGL2Backend(canvas, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS);
    }
  } catch (err) {
    diag.backend = '初始化失败';
    diag.note = String(err);
    return;
  }

  if (!active) {
    diag.backend = '无可用后端';
    diag.note = 'WebGPU 与 WebGL2 均不可用，无法渲染';
    return;
  }
  backend = active;
  (window as typeof window & { __emergeBackend?: Backend }).__emergeBackend = backend;
  diag.backend = backend.id === 'webgpu' ? 'WebGPU Compute' : 'WebGL2 GPGPU';
  if (!diag.note) {
    diag.note = override
      ? `强制后端 ${backend.id}；${caps.webgpu.adapter ?? ''}`
      : `WebGPU: ${caps.webgpu.adapter ?? '不可用'}`;
  }

  const lifeEngine = engine;
  const activeBackend = backend;
  const inputPointer = pointer;
  (window as typeof window & { __emergeEngine?: LifeEngine }).__emergeEngine = lifeEngine;

  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  lastTime = performance.now();
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // FPS：0.5s 滑动窗口平均。
    fpsWindow += dt;
    fpsFrames += 1;
    if (fpsWindow >= 0.5) {
      diag.fps = Math.round(fpsFrames / fpsWindow);
      fpsWindow = 0;
      fpsFrames = 0;
    }

    lifeEngine.setPointer(inputPointer.getReading());
    lifeEngine.update(dt);
    activeBackend.frame(lifeEngine.getState(), dt);
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
