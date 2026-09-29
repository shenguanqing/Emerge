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
import { applyDNA, generateDNA, type LifeDNA } from './core/DNAEngine';
import { MemoryEngine, createMemoryState } from './core/MemoryEngine';
import { GrowthEngine } from './core/GrowthEngine';
import { clearLife, defaultStorage, loadLife, saveLife, SCHEMA_VERSION } from './core/LifeStorage';
import { LifeClock } from './core/LifeClock';
import DebugPanel from './ui/DebugPanel.vue';
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
  life: '',
});

const quality = new QualityManager();
const debugMode = ref(false);

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
  // 成长乘数：生命体越成熟，同档位下粒子越多。
  const g = engine?.getState().growth ?? 0;
  const count = Math.min(Math.round(cfg.particles * (0.85 + 0.4 * g)), 100_000);
  backend?.setActiveCount(count);
  backend?.setPointSize(cfg.pointSize);
  diag.particles = count;
  diag.quality = tier;
  resize();
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // 桌面透明模式：Tauri 窗口内无黑底，生命体直接漂浮在桌面上。
  const isDesktop = '__TAURI_INTERNALS__' in window;
  document.documentElement.classList.toggle('desktop-transparent', isDesktop);

  // ---- 生命存档：DNA 永久保存，记忆与年龄跨会话累积 ----
  const storage = defaultStorage();
  const nowDate = new Date();
  // URL 参数：?timelapse=N 时间倍率、?debug=1 调试面板、?offline=N 模拟离开、?age=N 里程碑年龄
  const urlParams = new URLSearchParams(window.location.search);
  const timelapse = Math.max(Number(urlParams.get('timelapse') ?? '1') || 1, 1);
  debugMode.value = urlParams.get('debug') === '1';
  const clock = new LifeClock(timelapse);
  let dna: LifeDNA;
  let memory: MemoryEngine;
  let growth: GrowthEngine;
  let offlineMinutes = 0;
  // 重置守卫：清档后旧页面卸载时的自动存档可能写回旧数据，这里再次清除。
  const resetting = sessionStorage.getItem('emerge.reset') === '1';
  if (resetting) {
    clearLife(storage);
    sessionStorage.removeItem('emerge.reset');
  }
  const loaded = resetting ? ({ ok: false, reason: 'empty' } as const) : loadLife(storage);
  if (loaded.ok) {
    dna = loaded.snapshot.dna;
    memory = new MemoryEngine(loaded.snapshot.memory);
    growth = new GrowthEngine({
      days: memory.growthInputs.days,
      interactionMinutes: memory.state.interactionMinutes,
      growthBias: dna.growthBias,
    });
    offlineMinutes = Math.max(0, (Date.now() - loaded.snapshot.lastActiveTime) / 60000) * timelapse;
  } else {
    dna = generateDNA(nowDate.getTime());
    memory = new MemoryEngine(createMemoryState(clock.date()));
    // ?age=N：直接把生命带到 N 天里程碑（测试成长形态用）。
    const ageParam = Number(urlParams.get('age') ?? '0');
    if (ageParam > 1) {
      for (let i = ageParam; i >= 1; i -= 1) {
        memory.state.daysSeen.push(
          new Date(clock.now() - i * 86400000).toISOString().slice(0, 10),
        );
      }
      memory.state.interactionMinutes = ageParam * 30;
    }
    growth = new GrowthEngine({
      days: memory.growthInputs.days,
      interactionMinutes: memory.state.interactionMinutes,
      growthBias: dna.growthBias,
    });
  }
  const params = { ...DEFAULT_LIFE_PARAMS };
  const simParams = { ...DEFAULT_SIMULATION_PARAMS };
  applyDNA(dna, params, simParams);
  diag.life = `${dna.id} · ${growth.state.stage}`;
  diag.particles = Math.round(params.particleCount * growth.state.particleMul);
  void storage;

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

  engine = new LifeEngine(params, { dna, memory, growth, clock });
  const offlineParam = Number(urlParams.get('offline') ?? '0');
  if (offlineParam > 0) engine.wakeFromOffline(offlineParam);
  else if (offlineMinutes >= 10) engine.wakeFromOffline(offlineMinutes);
  (window as typeof window & { __emergeClock?: LifeClock }).__emergeClock = clock;
  (window as typeof window & { __emergeMemory?: MemoryEngine }).__emergeMemory = memory;
  pointer = new PointerSystem();
  pointer.attach(canvas);

  let active: Backend | null = null;
  try {
    if (backendId === 'webgpu') {
      active = await WebGPUBackend.create(canvas, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS);
      if (!active) diag.note = 'WebGPU 初始化失败，尝试回退 WebGL2';
    }
    if (!active && (backendId === 'webgl2' || backendId === 'none') && caps.webgl2.available) {
      active = new WebGL2Backend(canvas, params, DEFAULT_SIMULATION_PARAMS, isDesktop);
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
  if (backend instanceof WebGL2Backend) {
    (window as typeof window & { __emergeBackendRef?: WebGL2Backend }).__emergeBackendRef = backend;
  }

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
      diag.particles = Math.round(
        QUALITY_TIERS[quality.tier].particles * (0.85 + 0.4 * st.growth),
      );
      // 生命信息实时更新：年龄随虚拟时钟、成长百分比随时可见。
      diag.life = `${st.lifeId} · ${st.ageDays}天 · ${st.stage} · 成长${Math.round(st.growth * 100)}%`;
    }

    // 低功耗帧限制：闲置时 60→30→15，模拟步长按真实间隔保持速度一致。
    frameAcc += dt;
    const interval = 1 / quality.targetFps;
    if (frameAcc + 0.0005 < interval) return;
    const simDt = frameAcc;
    frameAcc = 0;

    inputPointer.tick(simDt);
    lifeEngine.setPointer(inputPointer.getReading());
    lifeEngine.setPress(inputPointer.isPressing());
    const click = inputPointer.consumeClick();
    if (click) lifeEngine.click(click.x, click.y, click.z);
    lifeEngine.update(simDt);
    activeBackend.frame(lifeEngine.getState(), simDt);
  };
  rafId = requestAnimationFrame(loop);

  // 自动存档：30 秒一次 + 页面隐藏/关闭时。
  const save = () => {
    saveLife(storage, {
      schemaVersion: SCHEMA_VERSION,
      dna,
      memory: memory.state,
      lastActiveTime: Date.now(),
    });
  };
  save();
  const saveTimer = window.setInterval(save, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('beforeunload', save);
  void saveTimer;
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
      :life="diag.life"
    />
    <DebugPanel v-if="debugMode" />
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
