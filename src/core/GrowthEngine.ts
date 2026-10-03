/**
 * 成长引擎：DNA + 长期使用共同决定成长（结构变化，非换肤）。
 * 成长 0..1 连续推进；阶段只做可视化参考，不预设物种。
 * 四形态 Origin / Awaken / Conscious / Emerge 共用粒子生命核心母体，
 * 差别在结构复杂度（轨道、旋涡、神经网、碎片、弧流），不是四套外形。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export type FormStage = 'origin' | 'awaken' | 'conscious' | 'emerge';

/** 渲染拓扑上限：两个 GPU 后端使用相同的轨道与节点编号。 */
export const FORM_ORBIT_LANES = 30;
export const FORM_NODE_COUNT = 24;

export interface GrowthInputs {
  /** 陪伴天数。 */
  days: number;
  /** 累计互动分钟。 */
  interactionMinutes: number;
  companionMinutes?: number;
  musicMinutes?: number;
  growthFloor?: number;
  /** DNA 成长倾向 0..1。 */
  growthBias: number;
  /** DNA 尾迹倾向 0..1（微调弧流强度，不改变轨道条数）。 */
  tailProbability: number;
}

/**
 * 形态结构参数 0..1（除 orbitCount 外），由成长度连续推导。
 * 与 HologramField 着色器曲线保持一致，禁止在这里单独改公式。
 */
export interface FormStructure {
  /** 核心组织亮度：随成长增强，保留可辨的粒子与间隙。 */
  coreGlow: number;
  /** 轨道密度 0..1（映射到轨道条数，永远不完整）。 */
  orbitDensity: number;
  /** 轨道条数 3..30（Origin≈4 / Awaken≈10 / Conscious≈18 / Emerge≈30）。 */
  orbitCount: number;
  /** 轨道不完整程度（始终偏高，禁止封口成圆）。 */
  orbitBroken: number;
  /** 内旋涡强度与数量。 */
  vortex: number;
  /** 神经网节点密度、连线活跃度。 */
  neural: number;
  /** 弯曲脉络：连接核心与局部节点（Awaken 起，Emerge 部分让位给环轨）。 */
  spoke: number;
  /** 分区孔隙膜与断续经向微脉络的组织程度，补足体积并保留暗缝。 */
  membrane: number;
  /** 外围碎片与独立粒子群。 */
  fragment: number;
  /** 弧形脱离-回流（Emerge）。 */
  streamArc: number;
  /** 局部能量脉冲频率。 */
  pulse: number;
  /** 纵深衰减强度。 */
  depthFade: number;
}

export interface GrowthState {
  /** 成长进度 0..1。 */
  growth: number;
  /** 阶段标签（可视化参考）：Origin / Awaken / Conscious / Emerge。 */
  stage: FormStage;
  /** 四形态结构参数（同一母体，复杂度递增）。 */
  form: FormStructure;
  /** 活跃粒子乘数 0.7..1.8（随成长增多，填充变大的身体体积）。 */
  particleMul: number;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 四形态阶段阈值：与存档兼容，不随视觉改版变动。 */
export function formStage(growth: number): FormStage {
  if (growth < 0.3) return 'origin';
  if (growth < 0.55) return 'awaken';
  if (growth < 0.85) return 'conscious';
  return 'emerge';
}

/**
 * 由成长度推导结构参数。曲线与 HologramField GLSL 一致；
 * tailProbability 只微调弧流强度，不改变阶段身份与轨道条数。
 */
export function formStructure(growth: number, tailProbability = 0.5): FormStructure {
  const g = clamp01(growth);
  const tail = clamp01(tailProbability);
  // 轨道：3 + 27·g^1.6 → Origin≈4 / Awaken≈10 / Conscious≈18 / Emerge≈30。
  const orbitDensity = Math.pow(g, 1.6);
  const orbitCount = 3 + (FORM_ORBIT_LANES - 3) * orbitDensity;
  return {
    coreGlow: 0.28 + 0.72 * g,
    orbitDensity,
    orbitCount: Math.min(FORM_ORBIT_LANES, Math.round(orbitCount)),
    orbitBroken: 0.72 + 0.28 * (1 - g),
    vortex: 0.22 + 0.78 * smoothstep(0.12, 0.55, g),
    neural: smoothstep(0.1, 0.78, g),
    spoke: smoothstep(0.2, 0.5, g) * (1 - 0.55 * smoothstep(0.78, 1, g)),
    membrane: smoothstep(0.18, 0.55, g),
    fragment: smoothstep(0.5, 0.9, g),
    streamArc: smoothstep(0.72, 0.98, g) * (0.7 + 0.3 * tail),
    pulse: smoothstep(0.48, 0.88, g),
    depthFade: 0.42 + 0.58 * g,
  };
}

export class GrowthEngine {
  state: GrowthState;

  constructor(inputs: GrowthInputs) {
    this.state = this.compute(inputs);
  }

  /** 成长只前进不回退（inputs 只增）。 */
  update(inputs: GrowthInputs): void {
    const next = this.compute(inputs);
    if (next.growth > this.state.growth) {
      this.state = next;
    }
  }

  private compute(inputs: GrowthInputs): GrowthState {
    // 三条路径共同积累；陪伴项不封顶，最慢 DNA 也能仅靠陪伴成熟。
    const companion = Math.max(0, inputs.companionMinutes ?? 0) / 2400;
    const interact = Math.max(0, inputs.interactionMinutes) / 240 * 0.5;
    const music = Math.max(0, inputs.musicMinutes ?? 0) / 300 * 0.35;
    const days = clamp01((inputs.days - 1) / 20) * 0.15;
    const speed = 0.7 + 0.6 * clamp01(inputs.growthBias);
    const growth = clamp01(Math.max(inputs.growthFloor ?? 0, (companion + interact + music + days) * speed));

    return {
      growth,
      stage: formStage(growth),
      form: formStructure(growth, inputs.tailProbability),
      // 成长后体积（轨道/神经网/碎片）变大，粒子要跟上否则发稀。
      particleMul: 0.7 + 1.1 * growth,
    };
  }
}
