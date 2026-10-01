<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  DEFAULT_LIFE_PARAMS,
  DEFAULT_SIMULATION_PARAMS,
} from './core/types';
import { FramePacer } from './core/FramePacer';
import { LifeEngine } from './core/LifeEngine';
import { WebGL2Backend } from './render/backends/webgl2/WebGL2Backend';
import { WebGPUBackend } from './render/backends/webgpu/WebGPUBackend';
import { probeCapabilities } from './render/capability';
import { PointerSystem } from './input/PointerSystem';
import { QUALITY_TIERS, qualityAppearance, QualityManager, type QualityTier } from './core/QualityManager';
import { applyDNA, generateDNA, type LifeDNA } from './core/DNAEngine';
import { MemoryEngine, createMemoryState } from './core/MemoryEngine';
import { GrowthEngine } from './core/GrowthEngine';
import { clearLife, defaultStorage, loadLife, saveLife, SCHEMA_VERSION, MemoryStorage, STORAGE_KEY } from './core/LifeStorage';
import { LifeClock } from './core/LifeClock';
import DebugPanel from './ui/DebugPanel.vue';
import MusicControl from './ui/MusicControl.vue';
import Observatory from './ui/Observatory.vue';
import type { MusicFeatures } from './input/AudioSystem';
import Diagnostics from './ui/Diagnostics.vue';
import { DEFAULT_CAMERA, worldToCssOnViewPlane, type OrbitCamera } from './render/ViewState';
import { setLocaleMode, stageDisplayName, t, locale, type LocaleMode } from './i18n';
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
/** 画布代数：WebGPU 失败回退 WebGL2 时 +1，让 Vue 换新 canvas（旧 canvas 不能再取 WebGL context）。 */
const canvasEpoch = ref(0);
const diag = reactive({
  backend: '探测中…',
  note: '',
  fps: 0,
  particles: DEFAULT_LIFE_PARAMS.particleCount,
  dpr: 1,
  mood: 'calm',
  quality: 'high',
  targetFps: 60,
  life: '',
});

const quality = new QualityManager();
const debugMode = ref(false);

/** 观察空间：双击进入，拖动旋转 / 滚轮缩放。 */
const observatoryOpen = ref(false);
const observatoryInsets = ref({ top: isDesktop ? 48 : 0, right: 0, bottom: 0, left: 0 });
const observatoryCamera = ref<OrbitCamera>({ ...DEFAULT_CAMERA, distance: 5.4 });
const observatory = reactive({
  state: null as ReturnType<LifeEngine['getState']> | null,
  growth: null as ReturnType<LifeEngine['getGrowthSummary']> | null,
  dna: null as Pick<LifeDNA, 'id' | 'symmetry' | 'curiosityBase' | 'energyBase' | 'growthBias' | 'orbitBias'> | null,
});
let observatorySyncAt = 0;

function applyOrbitView(cam: OrbitCamera): void {
  backend?.setView(cam);
  pointer?.setCamera(cam);
  if (pointer) pointer.lastActivity = performance.now();
}

function openObservatory(): void {
  observatoryOpen.value = true;
  if (isDesktop) {
    void invoke<{ top: number; right: number; bottom: number; left: number }>('desktop_content_insets')
      .then((insets) => { observatoryInsets.value = insets; })
      .catch((error) => { diag.note = String(error); });
  }
  pointer?.clearGestures();
  pointer?.ingest(0, 0, false);
  // 相机环绕当前核心，避免桌面摆位后主体跑出画面；略微拉近便于看清结构。
  const core = engine?.getState().corePosition ?? [0, 0, 0];
  observatoryCamera.value = {
    ...DEFAULT_CAMERA,
    distance: 5.4,
    target: [core[0], core[1], core[2]],
  };
  applyOrbitView({ ...observatoryCamera.value });
  if (isDesktop) {
    // 观察空间需要点到侧栏，临时关掉穿透。
    void invoke('set_observatory_open', { open: true }).catch((error) => { diag.note = String(error); });
  }
}

function closeObservatory(): void {
  observatoryOpen.value = false;
  pointer?.clearGestures();
  applyOrbitView({ ...DEFAULT_CAMERA });
  if (isDesktop) {
    void invoke('set_observatory_open', { open: false }).catch((error) => { diag.note = String(error); });
  }
}

/** 双击是否落在粒子团上：核心投影到屏幕，与实体包络半径比较（含呼吸、44px 手指余量）。 */
function doubleClickOnEntity(cssX: number, cssY: number): boolean {
  const canvas = canvasRef.value;
  if (!canvas || !engine) return false;
  const state = engine.getState();
  const core = state.corePosition;
  const { x, y, worldPerPx } = worldToCssOnViewPlane(
    DEFAULT_CAMERA,
    [core[0], core[1], core[2]],
    canvas.clientWidth,
    canvas.clientHeight,
  );
  // 主体 ≈1.2×bodyBase，弧流/碎片外缘放宽到 1.6×bodyBase×呼吸。
  const radiusWorld = 1.6 * 0.85 * visual.bodyScale * state.breathScale;
  const radiusCss = Math.max(radiusWorld / worldPerPx, 44);
  return Math.hypot(cssX - x, cssY - y) <= radiusCss;
}

/** 接收窗口事件时保留原生 DOM 双击；穿透时仍走全局指针通道。 */
function onCanvasDoubleClick(event: MouseEvent): void {
  if (observatoryOpen.value) return;
  const rect = canvasRef.value?.getBoundingClientRect();
  if (rect && doubleClickOnEntity(event.clientX - rect.left, event.clientY - rect.top)) {
    openObservatory();
  }
}

let musicFeatures: MusicFeatures | null = null;
function onMusic(f: unknown): void {
  // 节拍只保留一帧，禁止锁存（锁存会让外壳一直被软化，像「变了个人」）。
  musicFeatures = f as MusicFeatures;
}

type Backend = WebGL2Backend | WebGPUBackend;

let unmounted = false;
let engine: LifeEngine | null = null;
let backend: Backend | null = null;
let pointer: PointerSystem | null = null;
let unlistenGlobal: (() => void) | null = null;
let unlistenLock: (() => void) | null = null;
let unlistenLocale: (() => void) | null = null;
let unlistenVisual: (() => void) | null = null;
let unlistenVisibility: (() => void) | null = null;
let unlistenCloseObs: (() => void) | null = null;
let unlistenOpenObs: (() => void) | null = null;
let desktopVisible = true;
let unlistenDebug: (() => void) | null = null;
let clockTimer = 0;
let cleanupSave: (() => void) | null = null;

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
  // 界面语言同步到 Rust：托盘菜单与设置窗标题按 locale 重建。
  if (isDesktop) {
    void invoke('set_ui_locale', { locale: locale.value }).catch(() => {});
    watch(locale, (loc) => {
      void invoke('set_ui_locale', { locale: loc }).catch(() => {});
    });
  }
  let canvas = canvasRef.value;
  if (!canvas) return;

  // 设置面板持久化：团大小 / 颜色 / 亮度 / 点大小 / 行为开关。
  const saved = loadSettings();
  // URL 参数：?timelapse=N 时间倍率、?debug=1 调试面板、?offline=N 模拟离开、
  // ?age=N 里程碑年龄、?growth=N 直接设定成长度下限、?bodyScale=N 截图覆盖团大小并居中。
  const urlParams = new URLSearchParams(window.location.search);
  if (isDesktop) {
    try { await invoke('apply_settings', { topmost: saved.topmost, clickthrough: saved.clickthrough }); }
    catch (error) { diag.note = t('note.windowRestore', { e: String(error) }); }
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
  // 视觉/时间预览使用存档副本，避免测试形态写回真实成长记录。
  const persistedStorage = defaultStorage();
  const preview = ['growth', 'age', 'offline', 'timelapse'].some((key) => urlParams.has(key));
  const storage = preview ? new MemoryStorage() : persistedStorage;
  if (preview) {
    const savedLife = persistedStorage.getItem(STORAGE_KEY);
    if (savedLife) storage.setItem(STORAGE_KEY, savedLife);
  }
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
  const resetting = !preview && sessionStorage.getItem('emerge.reset') === '1';
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
  observatory.dna = {
    id: dna.id,
    symmetry: dna.symmetry,
    curiosityBase: dna.curiosityBase,
    energyBase: dna.energyBase,
    growthBias: dna.growthBias,
    orbitBias: dna.orbitBias,
  };
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
  // 诊断/端到端验证出口：观察空间开关状态与双击命中判定。
  (window as typeof window & {
    __emergeDebug?: {
      observatoryOpen(): boolean;
      hitEntity(cssX: number, cssY: number): boolean;
      core(): number[] | null;
      bodyScale(): number;
      hitDebug(cssX: number, cssY: number): Record<string, number | boolean | null | undefined>;
    };
  }).__emergeDebug = {
    observatoryOpen: () => observatoryOpen.value,
    hitEntity: (cssX, cssY) => doubleClickOnEntity(cssX, cssY),
    core: () => (engine ? [...engine.getState().corePosition] : null),
    bodyScale: () => visual.bodyScale,
    hitDebug: (cssX, cssY) => {
      if (!engine) return { engine: false };
      const state = engine.getState();
      const canvas = canvasRef.value;
      if (!canvas) return { canvas: false };
      const core = state.corePosition;
      const p = worldToCssOnViewPlane(
        DEFAULT_CAMERA,
        [core[0], core[1], core[2]],
        canvas.clientWidth,
        canvas.clientHeight,
      );
      const radiusWorld = 1.6 * 0.85 * visual.bodyScale * state.breathScale;
      return {
        px: p.x,
        py: p.y,
        wpp: p.worldPerPx,
        breath: state.breathScale,
        radiusCss: Math.max(radiusWorld / p.worldPerPx, 44),
        dist: Math.hypot(cssX - p.x, cssY - p.y),
        hit: doubleClickOnEntity(cssX, cssY),
      };
    },
  };
  if (isDesktop) {
    clockTimer = window.setInterval(broadcastClock, 1000);
    broadcastClock();
  }
  (window as typeof window & { __emergeMemory?: MemoryEngine }).__emergeMemory = memory;
  pointer = new PointerSystem();
  if (isDesktop) {
    unlistenVisibility = await listenNative<boolean>('life-visibility', (visible) => { desktopVisible = visible; });
    unlistenOpenObs = await listenNative<unknown>('open-observatory', () => {
      if (!observatoryOpen.value) openObservatory();
    });
    // 设置窗打开时退出观察空间，避免遮罩盖住设置。
    unlistenCloseObs = await listenNative<unknown>('close-observatory', () => {
      if (observatoryOpen.value) closeObservatory();
    });
    // 桌面统一走全局指针（含按下/抬起），穿透与否反应一致。
    unlistenGlobal = await listenNative<{
      x: number;
      y: number;
      near: boolean;
      kind: 'move' | 'down' | 'up';
    }>('global-pointer', (p) => {
      const ptr = pointer;
      if (!ptr || observatoryOpen.value) return;
      if (p.kind === 'down' && p.near) ptr.press(p.x, p.y, true);
      else if (p.kind === 'up') ptr.release();
      else ptr.ingest(p.x, p.y, p.near);
    });
    unlistenLock = await listenNative<{ x: number; y: number }>('desktop-position', (position) => {
      placement = { x: normalizePosition(position.x), y: normalizePosition(position.y) };
      applyPlacement();
    });
    // 语言在设置窗（独立 WebView）里切换时，主窗界面同步换语言；
    // 托盘重建由 App 自己的 locale watcher 走 set_ui_locale（幂等）。
    unlistenLocale = await listenNative<LocaleMode>('ui-locale-changed', (mode) => {
      setLocaleMode(mode);
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
      if (!active) diag.note = t('note.webgpuFallback');
    }
    if (!active && caps.webgl2.available) {
      // 获取过 WebGPU context 的 canvas 不能再获取 WebGL context。
      // 用 :key 让 Vue 换新画布：手动 replaceWith 会让模板 ref 在下次重渲染时
      // 被重新绑回已游离的旧节点（画布尺寸读 0，双击命中等全部失效）。
      if (backendId === 'webgpu') {
        canvasEpoch.value += 1;
        await nextTick();
        const next = canvasRef.value;
        if (!next) throw new Error('WebGL2 回退画布未就绪');
        canvas = next;
        if (!isDesktop) { pointer.detach(); pointer.attach(next); }
      }
      active = new WebGL2Backend(canvas, params, simParams, isDesktop);
    }
  } catch (err) {
    diag.backend = t('note.initFailed');
    diag.note = String(err);
    return;
  }

  // 后端就绪后恢复位置锁定。
  placement = { x: saved.positionX, y: saved.positionY };
  applyPlacement();

  if (!active) {
    diag.backend = '无可用后端';
    diag.note = t('note.noBackend');
    return;
  }
  if (unmounted || !pointer || !engine) {
    active?.dispose();
    unlistenVisibility?.(); unlistenCloseObs?.(); unlistenOpenObs?.();
    unlistenGlobal?.(); unlistenLock?.(); unlistenLocale?.(); unlistenVisual?.(); unlistenDebug?.();
    clearInterval(clockTimer);
    return;
  }
  backend = active;
  applyVisual();
  applyTier(quality.tier);
  (window as typeof window & { __emergeBackend?: Backend }).__emergeBackend = backend;
  diag.backend = backend.id === 'webgpu' ? 'WebGPU Compute' : 'WebGL2 GPGPU';
  if (!diag.note) {
    diag.note = override
      ? t('note.forceBackend', { id: backend.id, adapter: caps.webgpu.adapter ?? '' })
      : `WebGPU: ${caps.webgpu.adapter ?? ''}`;
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
  const pacer = new FramePacer();
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop);
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    if (document.hidden || !desktopVisible || dt > 0.25) {
      lifeEngine.setVisible(false);
      pacer.reset(); fpsWindow = 0; fpsFrames = 0;
      return;
    }

    // FPS：0.5s 滑动窗口平均 + 质量档位与低功耗调度。
    fpsWindow += dt;
    if (fpsWindow >= 0.5) {
      diag.fps = Math.round(fpsFrames / fpsWindow);
      const idleSeconds = (performance.now() - inputPointer.lastActivity) / 1000;
      const q = quality.sample(diag.fps, idleSeconds, fpsWindow, lifeEngine.getState().growth, !!musicFeatures?.active && musicFeatures.energy > 0.04);
      if (q.tierChanged) applyTier(q.tier);
      if (q.targetFpsChanged) diag.targetFps = q.targetFps;
      fpsWindow = 0;
      fpsFrames = 0;
      // 状态显示：连续权重的主导项，非互斥切换。
      const st = lifeEngine.getState();
      diag.mood =
        st.scared > 0.45 ? t('diag.mood.scared') : st.curious > 0.45 ? t('diag.mood.curious') : st.contract > 0.2 ? t('diag.mood.alert') : t('diag.mood.calm');
      const appearance = qualityAppearance(quality.tier, st.growth);
      diag.particles = appearance.count;
      activeBackend.setActiveCount(appearance.count);
      tierPointSize = appearance.pointSize;
      activeBackend.setPointSize(tierPointSize * visual.pointScale * Math.pow(visual.bodyScale, 0.7));
      // 生命信息：托盘只留天数与成长；Life ID 在设置「成长」里查看。
      const daysSeen = lifeEngine.getGrowthSummary()?.days ?? st.ageDays;
      diag.life = t('trayLife', {
        id: st.lifeId,
        days: daysSeen,
        dayWord: t('unit.days'),
        stage: stageDisplayName(st.stage),
        pct: Math.round(st.growth * 100),
      });
      const trayText = `${daysSeen}${t('unit.days')} · ${stageDisplayName(st.stage)} ${t('unit.growth')} ${Math.round(st.growth * 100)}%`;
      if (isDesktop && trayText !== lastTrayLife) {
        lastTrayLife = trayText;
        void invoke('update_life_info', { text: trayText }).catch(() => { lastTrayLife = ''; });
      }
    }

    // 低功耗帧限制：闲置时 60→30→15，模拟步长按真实间隔保持速度一致。
    const simDt = pacer.step(dt, quality.targetFps);
    if (simDt === null) return;
    fpsFrames += 1;

    inputPointer.tick(simDt);
    lifeEngine.setPointer(inputPointer.getReading());
    // 观察空间里拖动只转相机，不再驱动按压吸引与涟漪。
    lifeEngine.setPress(inputPointer.isPressing() && !observatoryOpen.value);
    // 双击进观察空间；单击涟漪延迟 300ms，不与双击叠加。
    // 只有双击落在粒子团上才打开；双击空白不响应（观察空间打开时双击任意处关闭）。
    const doubleClick = inputPointer.consumeDoubleClick();
    if (doubleClick) {
      if (observatoryOpen.value) closeObservatory();
      else if (doubleClickOnEntity(doubleClick.x, doubleClick.y)) openObservatory();
    }
    const click = inputPointer.consumeClick();
    if (click && !observatoryOpen.value) lifeEngine.click(click.x, click.y, click.z);
    if (musicFeatures) {
      // 直接引用复用对象，update 读取后再清 beat，避免丢节拍。
      lifeEngine.setMusic(musicFeatures);
    }
    lifeEngine.setVisible(!document.hidden && desktopVisible);
    lifeEngine.update(simDt);
    if (musicFeatures) musicFeatures.beat = false;
    if (observatoryOpen.value) {
      // 5Hz 同步足够读数；每帧赋新对象会让侧栏跟着 60fps 重绘。
      const nowMs = performance.now();
      if (nowMs - observatorySyncAt > 200) {
        observatorySyncAt = nowMs;
        observatory.state = lifeEngine.getState();
        observatory.growth = lifeEngine.getGrowthSummary();
      }
    }
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
  const onVisibility = () => { if (document.hidden) save(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', save);
  cleanupSave = () => {
    clearInterval(saveTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', save);
  };
});

onBeforeUnmount(() => {
  unmounted = true;
  cancelAnimationFrame(rafId);
  clearInterval(clockTimer);
  cleanupSave?.();
  resizeObserver?.disconnect();
  unlistenVisibility?.();
  unlistenCloseObs?.();
  unlistenOpenObs?.();
  unlistenGlobal?.();
  unlistenLock?.();
  unlistenLocale?.();
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
    <canvas :key="canvasEpoch" ref="canvasRef" class="stage-canvas" @dblclick="onCanvasDoubleClick"></canvas>
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
    <MusicControl :controls-visible="observatoryOpen" @features="onMusic" />
    <DebugPanel v-if="debugMode" />
    <Observatory
      v-if="observatoryOpen"
      :state="observatory.state"
      :growth="observatory.growth"
      :dna="observatory.dna"
      :initial="observatoryCamera"
      :insets="observatoryInsets"
      @close="closeObservatory"
      @view="applyOrbitView"
    />
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
