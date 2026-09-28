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
import { QUALITY_TIERS, QualityManager, type QualityTier } from './core/QualityManager';
import Diagnostics from './ui/Diagnostics.vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const diag = reactive({
  backend: '探测中…',
  note: '',
  fps: 0,
  particles: DEFAULT_LIFE_PARAMS.particleCount,
  dpr: 1,
  mood: '平静',
  quality: 'high',
  targetFps: 60,
});

const quality = new QualityManager();

type Backend = WebGL2Backend | WebGPUBackend;

let engine: LifeEngine | null = null;
let backend: Backend | null = null;
let pointer: PointerSystem | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;
let beaconTimer = 0;
let lastTime = 0;
let fpsWindow = 0;
let fpsFrames = 0;

function resize(): void {
  const canvas = canvasRef.value;
  if (!canvas || !backend) return;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const tier = QUALITY_TIERS[quality.tier as QualityTier];
  const dpr = Math.min(window.devicePixelRatio || 1, tier.maxDpr);
  backend.resize(w, h, dpr);
  if (pointer) pointer.setViewport(w, h);
  diag.dpr = dpr;
}

/** 应用质量档位：粒子数、点尺寸、DPR。 */
function applyTier(tier: QualityTier): void {
  const cfg = QUALITY_TIERS[tier];
  backend?.setActiveCount(cfg.particles);
  backend?.setPointSize(cfg.pointSize);
  diag.particles = cfg.particles;
  diag.quality = tier;
  resize();
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // 桌面透明模式：Tauri 窗口内无黑底，生命体直接漂浮在桌面上。
  const isDesktop = '__TAURI_INTERNALS__' in window;
  document.documentElement.classList.toggle('desktop-transparent', isDesktop);

  // 桌面诊断信标：把运行状态周期性上报给本地监听器（仅桌面模式）。
  if (isDesktop) {
    const emit = () => {
      try {
        fetch('http://127.0.0.1:41999/beacon', {
          method: 'POST',
          body: JSON.stringify({
            diag: { ...diag },
            errors: (window as typeof window & { __emergeErrors?: string[] }).__emergeErrors?.slice(-3) ?? [],
            win: {
              x: window.screenX,
              y: window.screenY,
              w: window.outerWidth,
              h: window.outerHeight,
              screen: `${window.screen.width}x${window.screen.height}`,
            },
            css: {
              htmlClass: document.documentElement.className,
              bodyBg: getComputedStyle(document.body).backgroundColor,
              htmlBg: getComputedStyle(document.documentElement).backgroundColor,
              canvases: document.querySelectorAll('canvas').length,
            },
          }),
        }).catch(() => {});
      } catch {}
    };
    beaconTimer = window.setInterval(emit, 2000);
    void emit;
  }

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
      active = new WebGL2Backend(canvas, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS, isDesktop);
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
  (window as typeof window & { __emergeQuality?: QualityManager }).__emergeQuality = quality;

  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  lastTime = performance.now();
  let frameAcc = 0;
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // FPS：0.5s 滑动窗口平均 + 质量档位与低功耗调度。
    fpsWindow += dt;
    fpsFrames += 1;
    if (fpsWindow >= 0.5) {
      diag.fps = Math.round(fpsFrames / fpsWindow);
      const idleSeconds = (performance.now() - inputPointer.lastActivity) / 1000;
      const q = quality.sample(diag.fps, idleSeconds, fpsWindow);
      if (q.tierChanged) applyTier(q.tier);
      if (q.targetFpsChanged) diag.targetFps = q.targetFps;
      fpsWindow = 0;
      fpsFrames = 0;
      // 状态显示：连续权重的主导项，非互斥切换。
      const st = lifeEngine.getState();
      diag.mood =
        st.scared > 0.45 ? '受惊' : st.curious > 0.45 ? '好奇' : st.contract > 0.2 ? '警觉' : '平静';
    }

    // 低功耗帧限制：闲置时 60→30→15，模拟步长按真实间隔保持速度一致。
    frameAcc += dt;
    const interval = 1 / quality.targetFps;
    if (frameAcc + 0.0005 < interval) return;
    const simDt = frameAcc;
    frameAcc = 0;

    inputPointer.tick(simDt);
    lifeEngine.setPointer(inputPointer.getReading());
    lifeEngine.update(simDt);
    activeBackend.frame(lifeEngine.getState(), simDt);
  };
  rafId = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (beaconTimer) clearInterval(beaconTimer);
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
      :mood="diag.mood"
      :quality="diag.quality"
      :target-fps="diag.targetFps"
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
/* 桌面透明模式：页面与画布均无底色 */
html.desktop-transparent,
html.desktop-transparent body {
  background: transparent;
}
.stage-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
