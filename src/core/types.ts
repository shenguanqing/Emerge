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
}

export const DEFAULT_LIFE_PARAMS: LifeParams = {
  particleCount: 32768,
  breathAmplitude: 0.08,
  breathRate: 0.2,
  driftSpeed: 0.22,
  driftRadius: 0.35,
  pointSize: 3.0,
};

/**
 * 模拟力场参数：WebGPU 与 WebGL2 两个后端共享同一份语义与数值，
 * 力的定义在各自 shader 中保持一致。
 */
export interface SimulationParams {
  /** 锚点弹簧刚度：粒子被拉向「核心 + 个体锚点」的目标位。 */
  shellStiffness: number;
  /** 核心长程吸引（1/dist 衰减）。 */
  coreGravity: number;
  /** 指数速度阻尼（v *= exp(-damping·dt)）。 */
  damping: number;
  /** 湍流幅度（Phase 2 为三角函数近似，Phase 4 换成 Curl Noise）。 */
  turbulenceAmp: number;
  /** 个体锚点半径范围（世界单位），Phase 3 改为有机形体采样。 */
  radiusMin: number;
  radiusMax: number;
}

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  shellStiffness: 2.2,
  coreGravity: 0.18,
  damping: 1.6,
  turbulenceAmp: 0.35,
  radiusMin: 1.25,
  radiusMax: 2.2,
};

/** 生命引擎每帧输出的只读快照；渲染层只消费，不回写。 */
export interface LifeState {
  /** 模拟累计时间（秒）。 */
  time: number;
  /** 呼吸相位（弧度，随时间持续累积）。 */
  breathPhase: number;
  /** 呼吸缩放系数 1 → 1 + breathAmplitude → 1 平滑循环。 */
  breathScale: number;
  /** 核心宏观位置（自主漂移中心，xyz 世界单位）。 */
  corePosition: [number, number, number];
}

export function createLifeState(): LifeState {
  return { time: 0, breathPhase: 0, breathScale: 1, corePosition: [0, 0, 0] };
}
