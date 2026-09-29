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
  /** 触发受惊散开的感知指针速度阈值（世界单位/秒）。 */
  scatterSpeed: number;
  /** 散开消退时间常数（秒）；锚点刚度随之恢复，重组约 2–4 秒。 */
  scatterRecoverTau: number;
  /** 警觉消退时间常数（秒）：受惊后保持更远距离。 */
  waryTau: number;
  /** 情绪基线：能量 / 好奇 / 信任（0..1），Phase 10 由 DNA 接管。 */
  energyBase: number;
  curiosityBase: number;
  trustBase: number;
}

/** 粒子缓冲按上限分配，质量档位只改变活跃数量（避免重分配）。 */
export const MAX_PARTICLES = 100_000;

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
  scatterSpeed: 3.0,
  scatterRecoverTau: 1.1,
  waryTau: 6.0,
  energyBase: 0.45,
  curiosityBase: 0.35,
  trustBase: 0.4,
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
  /** Curl Noise 流场强度（散度为零的旋度力）。 */
  curlStrength: number;
  /** Curl Noise 空间频率（越大流动尺度越小）。 */
  curlFrequency: number;
  /** Curl Noise 时间漂移速度（缓慢演化，避免固定循环）。 */
  curlSpeed: number;
  /** 有机形体基础半径（世界单位），形体函数在 shader 内定义。 */
  bodyBase: number;
  /** 凝聚期旋涡切向力基准强度（随 formMix 衰减到 0）。 */
  swirlBase: number;
  /** 指针影响半径（世界单位）。 */
  pointerRadius: number;
  /** 指针基础排斥强度（生命体感知到的「物理存在」）。 */
  pointerPush: number;
  /** 冲击速度阈值（世界单位/秒），超过即产生冲击波。 */
  impactSpeed: number;
  /** 冲击波强度。 */
  impactPush: number;
  /** 长按吸引场强度。 */
  pressStrength: number;
}

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  shellStiffness: 2.2,
  coreGravity: 0.18,
  damping: 1.6,
  curlStrength: 0.85,
  curlFrequency: 0.5,
  curlSpeed: 0.06,
  bodyBase: 1.35,
  swirlBase: 2.6,
  pointerRadius: 2.6,
  pointerPush: 1.8,
  impactSpeed: 2.0,
  impactPush: 9.0,
  pressStrength: 2.6,
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
  /** 受惊散开程度 0..1（强冲击触发，随时间消退）。 */
  scatter: number;
  /** 警觉程度 0..1（受惊后保持更远距离，消退更慢）。 */
  wary: number;
  /** 情绪连续参数与行为权重（诊断与渲染共用）。 */
  energy: number;
  stress: number;
  curious: number;
  scared: number;
  calm: number;
  /** 受惊收缩 0..1（身体锚点收缩）。 */
  contract: number;
  /** 情绪色偏 0..1（平静冷 ↔ 活跃暖），克制幅度。 */
  moodShift: number;
  /** 指针排斥乘数（信任/好奇时温和靠近，受惊时加强）。 */
  pointerPushMul: number;
  /** 长按吸引斜坡 0..1。 */
  pressRamp: number;
  /** 点击涟漪强度 0..1（衰减中）。 */
  clickPulse: number;
  /** 最近一次点击的世界坐标。 */
  clickPos: [number, number, number];
  /** 自发能量脉冲 0..1（可视化突发活跃）。 */
  pulseBoost: number;
  /** 成长进度 0..1。 */
  growth: number;
  /** 环结构显示量 0..1。 */
  ring: number;
  /** 双核心 0/1。 */
  dualCore: number;
  /** 第二核心偏移（世界坐标）。 */
  core2Offset: [number, number, number];
  /** 睡眠倾向 0..1（现实时间驱动）。 */
  sleepiness: number;
  /** 环境亮度乘 0..1。 */
  brightness: number;
  /** 形体对称度 0..1（DNA）。 */
  symmetry: number;
  /** Life ID（诊断显示）。 */
  lifeId: string;
  /** 年龄（虚拟天）。 */
  ageDays: number;
  /** 成长阶段标签。 */
  stage: string;
  /** 感知到的指针位置（世界坐标，含反应延迟）。 */
  pointerPos: [number, number, number];
  /** 感知到的指针速度（世界单位/秒）。 */
  pointerVel: [number, number, number];
  /** 指针感知活跃度 0..1。 */
  pointerActive: number;
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
    scatter: 0,
    wary: 0,
    energy: 0.45,
    stress: 0,
    curious: 0,
    scared: 0,
    calm: 1,
    contract: 0,
    moodShift: 0.5,
    pointerPushMul: 1,
    pressRamp: 0,
    clickPulse: 0,
    clickPos: [0, 0, 0],
    pulseBoost: 0,
    growth: 0,
    ring: 0,
    dualCore: 0,
    core2Offset: [0, 0, 0],
    sleepiness: 0,
    brightness: 1,
    symmetry: 0.4,
    lifeId: '',
    ageDays: 0,
    stage: 'nascent',
    pointerPos: [0, 0, 99],
    pointerVel: [0, 0, 0],
    pointerActive: 0,
  };
}
