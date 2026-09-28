/**
 * 生命体共享参数语义。
 * core 模块只依赖纯 TypeScript 数据；渲染、输入与 UI 通过该契约连接，
 * 不反向依赖 Three.js、Vue 或 DOM。
 */

/** 生命体连续可调参数（Phase 7 起由 EmotionEngine 驱动，Phase 1 提供初始值）。 */
export interface LifeParams {
  /** 粒子总数。Phase 1 原型取 8192 验证链路，Phase 2 提升至 20k–100k。 */
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
  particleCount: 8192,
  breathAmplitude: 0.08,
  breathRate: 0.2,
  driftSpeed: 0.22,
  driftRadius: 0.35,
  pointSize: 3.0,
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
