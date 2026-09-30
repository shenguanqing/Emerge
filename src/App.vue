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
import { QUALITY_TIERS, qualityAppearance, QualityManager, type QualityTier } from './core/QualityManager';
import { applyDNA, generateDNA, type LifeDNA } from './core/DNAEngine';
import { MemoryEngine, createMemoryState } from './core/MemoryEngine';
import { GrowthEngine } from './core/GrowthEngine';
import { clearLife, defaultStorage, loadLife, saveLife, SCHEMA_VERSION } from './core/LifeStorage';
import { LifeClock } from './core/LifeClock';
import DebugPanel from './ui/DebugPanel.vue';
import MusicControl from './ui/MusicControl.vue';
import type { MusicFeatures } from './input/AudioSystem';
import Diagnostics from './ui/Diagnostics.vue';
import { invoke, listenNative } from './platform/desktop';
import {
  loadSettings,
  desktopPosition,
  normalizePosition,
  resolveColors,
  type VisualSettings,
} from './core/settings';

const isDesktop = '__TAURI_INTERNALS__' in window;
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

let musicFeatures: MusicFeatures | null = null;
function onMusic(f: unknown): void {
  // 节拍只保留一帧，禁止锁存（锁存会让外壳一直被软化，像「变了个人」）。
  musicFeatures = f as MusicFeatures;
}

type Backend = WebGL2Backend | WebGPUBackend;

let engine: LifeEngine | null = null;
let backend: Backend | null = null;
let pointer: PointerSystem | null = null;
let unlistenGlobal: (() => void) | null = null;
let unlistenLock: (() => void) | null = null;
let unlistenVisual: (() => void) | null = null;
let unlistenVisibility: (() => void) | null = null;
let desktopVisible = true;
let unlistenDebug: (() => void) | null = null;
let clockTimer = 0;

/** 向设置窗推送虚拟时间（解锁后展示）。 */
function broadcastClock(): void {
  if (!isDesktop) return;
  const clock = (window as typeof window & {
    __emergeClock?: { scale: number; date(): Date };
  }).__emergeClock;
  if (!clock) return;
  const d = clock.date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const vnow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  void (window as typeof window & {
    __TAURI__?: { event?: { emit: (e: string, p: unknown) => Promise<void> } };
  }).__TAURI__?.event?.emit('clock-state', { vnow, scale: clock.scale, growth: engine?.getGrowthSummary() });
}
let resizeObserver: ResizeObserver | null = null;
/** 当前视觉设置（团大小 / 颜色 / 亮度 / 点大小倍率）。 */
let visual: VisualSettings = {
  bodyScale: 1,
  theme: 'gold',
  hue: 32,
  brightness: 1,
  pointScale: 1,
};
let tierPointSize = 3.0;

function applyVisual(): void {
  engine?.setInteractionScale(visual.bodyScale);
  if (!backend) return;
  const c = resolveColors(visual);
  backend.setVisual(visual.bodyScale, c.core, c.body, c.aura, visual.brightness);
  backend.setPointSize(tierPointSize * visual.pointScale * Math.pow(visual.bodyScale, 0.7));
}
let rafId = 0;
let lastTime = 0;
let fpsWindow = 0;
let fpsFrames = 0;
let placement = { x: 0.88, y: 0.84 };
function applyPlacement(): void {
  if (!isDesktop || !engine) return;
  const canvas = canvasRef.value;
  engine.setHome(desktopPosition(placement.x, placement.y, canvas?.clientWidth || window.innerWidth, canvas?.clientHeight || window.innerHeight));
  engine.setPositionLocked(true);
}
let lastTrayLife = '';

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
  applyPlacement();
}

/** 应用质量档位：粒子数、点尺寸、DPR。 */
function applyTier(tier: QualityTier): void {
  const g = engine?.getState().growth ?? 0;
  const appearance = qualityAppearance(tier, g);
  const count = appearance.count;
  backend?.setActiveCount(count);
  tierPointSize = appearance.pointSize;
  backend?.setPointSize(tierPointSize * visual.pointScale * Math.pow(visual.bodyScale, 0.7));
  diag.particles = count;
  diag.quality = tier;
  resize();
}

onMounted(async () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // 设置面板持久化：团大小 / 颜色 / 亮度 / 点大小 / 行为开关。
  const saved = loadSettings();
  // URL 参数：?timelapse=N 时间倍率、?debug=1 调试面板、?offline=N 模拟离开、
  // ?age=N 里程碑年龄、?growth=N 直接设定成长度下限、?bodyScale=N 截图覆盖团大小并居中。
  const urlParams = new URLSearchParams(window.location.search);
  if (isDesktop) {
    try { await invoke('apply_settings', { topmost: saved.topmost, clickthrough: saved.clickthrough }); }
    catch (error) { diag.note = `窗口设置恢复失败：${String(error)}`; }
  }
  visual = {
    bodyScale: saved.bodyScale,
    theme: saved.theme,
    hue: saved.hue,
    brightness: saved.brightness,
    pointScale: saved.pointScale,
  };
  placement = { x: saved.positionX, y: saved.positionY };
  // 截图/回归：?bodyScale=N 覆盖团大小并居中，?posX= & ?posY= 覆盖位置。
  const bodyOverride = Number(urlParams.get('bodyScale') ?? '0');
  if (bodyOverride > 0) {
    visual.bodyScale = Math.min(1, Math.max(0.1, bodyOverride));
    placement = { x: 0.5, y: 0.5 };
    const posX = Number(urlParams.get('posX') ?? '0');
    const posY = Number(urlParams.get('posY') ?? '0');
    if (posX > 0) placement.x = Math.min(0.95, Math.max(0.05, posX));
    if (posY > 0) placement.y = Math.min(0.95, Math.max(0.05, posY));
  }
  applyPlacement();

  // 桌面透明模式：Tauri 窗口内无黑底，生命体直接漂浮在桌面上。
  document.documentElement.classList.toggle('desktop-transparent', isDesktop);

  // ---- 生命存档：DNA 永久保存，记忆与年龄跨会话累积 ----
  const storage = defaultStorage();
  const nowDate = new Date();
  const timelapse = Math.max(Number(urlParams.get('timelapse') ?? '1') || 1, 1);
  debugMode.value = urlParams.get('debug') === '1';
  const growthParam = Number(urlParams.get('growth') ?? '0');
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
    if (growthParam > 0) {
      // 回归/截图：清掉累计输入，让 growthFloor 成为实际成长度。
      const g = Math.min(1, growthParam);
      memory.state.growthFloor = g;
      memory.state.totalMinutes = 0;
      memory.state.interactionMinutes = 0;
      memory.state.interactionCredit = 0;
      memory.state.musicMinutes = 0;
      memory.state.musicCredit = 0;
    }
    growth = new GrowthEngine({
      ...memory.growthInputs,
      growthBias: dna.growthBias,
      tailProbability: dna.tailProbability,
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
      memory.state.interactionCredit = ageParam * 30;
    }
    if (growthParam > 0) {
      const g = Math.min(1, growthParam);
      memory.state.growthFloor = g;
      memory.state.totalMinutes = 0;
      memory.state.interactionMinutes = 0;
      memory.state.interactionCredit = 0;
      memory.state.musicMinutes = 0;
      memory.state.musicCredit = 0;
    }
    growth = new GrowthEngine({
      ...memory.growthInputs,
      growthBias: dna.growthBias,
      tailProbability: dna.tailProbability,
    });
  }
  const params = { ...DEFAULT_LIFE_PARAMS };
  const simParams = { ...DEFAULT_SIMULATION_PARAMS };
  applyDNA(dna, params, simParams);
  diag.life = `${dna.id} · ${growth.state.stage}`;
  diag.particles = Math.round(params.particleCount * growth.state.particleMul);
  void storage;

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
  applyPlacement();
  const offlineParam = Number(urlParams.get('offline') ?? '0');
  if (offlineParam > 0) engine.wakeFromOffline(offlineParam);
  else if (offlineMinutes >= 10) engine.wakeFromOffline(offlineMinutes);
  (window as typeof window & { __emergeClock?: LifeClock }).__emergeClock = clock;
  if (isDesktop) {
    clockTimer = window.setInterval(broadcastClock, 1000);
    broadcastClock();
  }
  (window as typeof window & { __emergeMemory?: MemoryEngine }).__emergeMemory = memory;
  pointer = new PointerSystem();
  if (isDesktop) {
    unlistenVisibility = await listenNative<boolean>('life-visibility', (visible) => { desktopVisible = visible; });
    // 桌面统一走全局指针（含按下/抬起），穿透与否反应一致。
    unlistenGlobal = await listenNative<{
      x: number;
      y: number;
      near: boolean;
      kind: 'move' | 'down' | 'up';
    }>('global-pointer', (p) => {
      const ptr = pointer;
      if (!ptr) return;
      if (p.kind === 'down' && p.near) ptr.press(p.x, p.y, true);
      else if (p.kind === 'up') ptr.release();
      else ptr.ingest(p.x, p.y, p.near);
    });
    unlistenLock = await listenNative<{ x: number; y: number }>('desktop-position', (position) => {
      placement = { x: normalizePosition(position.x), y: normalizePosition(position.y) };
      applyPlacement();
    });
    // 设置面板视觉参数
    unlistenVisual = await listenNative<VisualSettings & {
      colors: { core: [number, number, number]; body: [number, number, number]; aura: [number, number, number] };
    }>('visual-settings', (v) => {
      visual = {
        bodyScale: v.bodyScale,
        theme: v.theme,
        hue: v.hue,
        brightness: v.brightness,
        pointScale: v.pointScale,
      };
      applyVisual();
    });
    // 设置面板内嵌时间加速：命令发到主窗执行。
    unlistenDebug = await listenNative<{
      type: 'scale' | 'advance' | 'interaction' | 'absence' | 'reset';
      value: number;
    }>('time-control', (cmd) => {
      const clock = (window as typeof window & {
        __emergeClock?: { scale: number; advance(ms: number): void };
      }).__emergeClock;
      const memory = (window as typeof window & {
        __emergeMemory?: { state: { interactionCredit: number; interactionMinutes: number } };
      }).__emergeMemory;
      if (cmd.type === 'scale' && clock) clock.scale = cmd.value;
      else if (cmd.type === 'advance' && clock) clock.advance(cmd.value * 86400000);
      else if (cmd.type === 'interaction' && memory) {
        memory.state.interactionMinutes += cmd.value;
        memory.state.interactionCredit += cmd.value;
      } else if (cmd.type === 'absence') {
        const url = new URL(window.location.href);
        url.searchParams.set('offline', String(cmd.value * 1440));
        window.location.href = url.toString();
      } else if (cmd.type === 'reset') {
        sessionStorage.setItem('emerge.reset', '1');
        localStorage.removeItem('emerge.life.v1');
        window.location.reload();
      }
      broadcastClock();
    });
  } else {
    pointer.attach(canvas);
  }

  let active: Backend | null = null;
  try {
    if (backendId === 'webgpu') {
      active = await WebGPUBackend.create(canvas, params, simParams, isDesktop);
      if (!active) diag.note = 'WebGPU 初始化失败，尝试回退 WebGL2';
    }
    if (!active && caps.webgl2.available) {
      active = new WebGL2Backend(canvas, params, simParams, isDesktop);
    }
  } catch (err) {
    diag.backend = '初始化失败';
    diag.note = String(err);
    return;
  }

  // 后端就绪后恢复位置锁定。
  placement = { x: saved.positionX, y: saved.positionY };
  applyPlacement();

  if (!active) {
    diag.backend = '无可用后端';
    diag.note = 'WebGPU 与 WebGL2 均不可用，无法渲染';
    return;
  }
  backend = active;
  applyVisual();
  applyTier(quality.tier);
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
    if (fpsWindow >= 0.5) {
      diag.fps = Math.round(fpsFrames / fpsWindow);
      const idleSeconds = (performance.now() - inputPointer.lastActivity) / 1000;
      const q = quality.sample(diag.fps, idleSeconds, fpsWindow, lifeEngine.getState().growth);
      if (q.tierChanged) applyTier(q.tier);
      if (q.targetFpsChanged) diag.targetFps = q.targetFps;
      fpsWindow = 0;
      fpsFrames = 0;
      // 状态显示：连续权重的主导项，非互斥切换。
      const st = lifeEngine.getState();
      diag.mood =
        st.scared > 0.45 ? '受惊' : st.curious > 0.45 ? '好奇' : st.contract > 0.2 ? '警觉' : '平静';
      const appearance = qualityAppearance(quality.tier, st.growth);
      diag.particles = appearance.count;
      activeBackend.setActiveCount(appearance.count);
      tierPointSize = appearance.pointSize;
      activeBackend.setPointSize(tierPointSize * visual.pointScale * Math.pow(visual.bodyScale, 0.7));
      // 生命信息：托盘只留天数与成长；Life ID 在设置「成长」里查看。
      const stageNames: Record<string, string> = { nascent: '初生', formed: '成形', ringed: '环生', dual: '双核' };
      const daysSeen = lifeEngine.getGrowthSummary()?.days ?? st.ageDays;
      diag.life = `ID ${st.lifeId} · ${daysSeen}天 · ${stageNames[st.stage]} · 成长 ${Math.round(st.growth * 100)}%`;
      const trayText = `${daysSeen}天 · ${stageNames[st.stage]} ${Math.round(st.growth * 100)}%`;
      if (isDesktop && trayText !== lastTrayLife) {
        lastTrayLife = trayText;
        void invoke('update_life_info', { text: trayText }).catch(() => { lastTrayLife = ''; });
      }
    }

    // 低功耗帧限制：闲置时 60→30→15，模拟步长按真实间隔保持速度一致。
    frameAcc += dt;
    const interval = 1 / quality.targetFps;
    if (frameAcc + 0.0005 < interval) return;
    fpsFrames += 1;
    const simDt = frameAcc;
    frameAcc = 0;

    inputPointer.tick(simDt);
    lifeEngine.setPointer(inputPointer.getReading());
    lifeEngine.setPress(inputPointer.isPressing());
    const click = inputPointer.consumeClick();
    if (click) lifeEngine.click(click.x, click.y, click.z);
    if (musicFeatures) {
      // 直接引用复用对象，update 读取后再清 beat，避免丢节拍。
      lifeEngine.setMusic(musicFeatures);
    }
    lifeEngine.setVisible(!document.hidden && desktopVisible);
    lifeEngine.update(simDt);
    if (musicFeatures) musicFeatures.beat = false;
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
  clearInterval(clockTimer);
  resizeObserver?.disconnect();
  unlistenVisibility?.();
  unlistenGlobal?.();
  unlistenLock?.();
  unlistenVisual?.();
  unlistenDebug?.();
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
    <Diagnostics v-if="!isDesktop || debugMode"
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
    <MusicControl @features="onMusic" />
    <DebugPanel v-if="debugMode" />
    <div v-if="debugMode && !diag.life" class="unlock-hint"></div>
  </main>
</template>

<style>
html:not(.settings-window),
html:not(.settings-window) body,
html:not(.settings-window) #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
html.settings-window,
html.settings-window body,
html.settings-window #app {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  height: auto;
  overflow: auto;
  background: #faf9f5;
}
.stage {
  position: fixed;
  inset: 0;
}
/* 桌面透明模式：页面与画布均无底色 */
html.desktop-transparent,
html.desktop-transparent body,
html.desktop-transparent #app {
  background: transparent;
}
/* 画面左下角热区已移除：隐藏入口改为设置面板标题连点。 */
.unlock-hint {
  display: none;
}
.stage-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
