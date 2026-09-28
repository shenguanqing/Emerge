/**
 * 生命体共享参数语义。
 * core 模块只依赖纯 TypeScript 数据；渲染、输入与 UI 通过该契约连接，
 * 不反向依赖 Three.js、Vue 或 DOM。
 */

/** 生命体连续可调参数（Phase 7 起由 EmotionEngine 驱动，Phase 1 提供初始值）。 */
export interface LifeParams {
  /** 粒子总数。MVP 20k–100k；Phase 2 起 32,768 起。 */
  particleCount: number;
  /** 呼吸幅度：核心尺度 1 → 1 + breathAmplitude → 1。 */
  breathAmplitude: number;
  /** 呼吸频率（次/秒），平静状态约 0.2。 */
  breathRate: number;
  /** 核心自主漂移速度（世界单位/秒）。 */
  driftSpeed: number;
  /** 核心漂移半径（世界单位）。 */
  driftRadius: number;
  /** 粒子基础尺寸（像素，渲染时乘 DPR 与深度衰减）。 */
  pointSize: number;
  /** 启动凝聚时长（秒）：旋涡收拢到成形。 */
  coalesceSeconds: number;
  /** 粒子逐个显现的总时长（秒）。 */
  revealSeconds: number;
}

export const DEFAULT_LIFE_PARAMS: LifeParams = {
  particleCount: 32768,
  breathAmplitude: 0.08,
  breathRate: 0.2,
  driftSpeed: 0.22,
  driftRadius: 0.35,
  pointSize: 3.0,
  /** 启动凝聚时长（秒）：旋涡收拢到成形。 */
  coalesceSeconds: 7.5,
  /** 粒子逐个显现的总时长（秒）。 */
  revealSeconds: 3.2,
};

/**
 * 模拟力场参数：WebGPU 与 WebGL2 两个后端共享同一份语义与数值，
 * 力的定义在各自 shader 中保持一致。
 */
export interface SimulationParams {
  /** 锚点弹簧刚度（按层级再加权：核心×3.2 / 身体×1.0 / 外围×0.55）。 */
  shellStiffness: number;
  /** 核心长程吸引（1/dist 衰减）。 */
  coreGravity: number;
  /** 指数速度阻尼（v *= exp(-damping·dt)）。 */
  damping: number;
  /** 湍流幅度（Phase 2 为三角函数近似，Phase 4 换成 Curl Noise）。 */
  turbulenceAmp: number;
  /** 有机形体基础半径（世界单位），形体函数在 shader 内定义。 */
  bodyBase: number;
  /** 凝聚期旋涡切向力基准强度（随 formMix 衰减到 0）。 */
  swirlBase: number;
}

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  shellStiffness: 2.2,
  coreGravity: 0.18,
  damping: 1.6,
  turbulenceAmp: 0.35,
  bodyBase: 1.35,
  swirlBase: 2.6,
};

/** 生命引擎每帧输出的只读快照；渲染层只消费，不回写。 */
export interface LifeState {
  /** 模拟累计时间（秒）。 */
  time: number;
  /** 呼吸相位（弧度，随时间持续累积）。 */
  breathPhase: number;
  /** 呼吸缩放系数 1 → 1 + breathAmplitude → 1 平滑循环。 */
  breathScale: number;
  /** 呼吸波形 0..1（0.5 − 0.5·cos breathPhase），供亮度/外围相位使用。 */
  breathWave: number;
  /** 核心宏观位置（自主漂移中心，xyz 世界单位）。 */
  corePosition: [number, number, number];
  /** 凝聚进度 0（松散旋涡）→ 1（成形），驱动旋涡力衰减。 */
  formMix: number;
  /** 启动以来经过的秒数，驱动粒子逐个显现。 */
  revealT: number;
}

export function createLifeState(): LifeState {
  return {
    time: 0,
    breathPhase: 0,
    breathScale: 1,
    breathWave: 0,
    corePosition: [0, 0, 0],
    formMix: 0,
    revealT: 0,
  };
}
