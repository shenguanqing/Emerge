/**
 * 成长引擎：DNA + 长期使用共同决定成长（结构变化，非换肤）。
 * 成长 0..1 连续推进；阶段只做可视化参考，不预设物种。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

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
  /** DNA 尾迹倾向 0..1（决定旋臂数量上限）。 */
  tailProbability: number;
}

export interface GrowthState {
  /** 成长进度 0..1。 */
  growth: number;
  /** 环结构显示量 0..1（成长后期出现的行星环）。 */
  ring: number;
  /** 双核心是否解锁。 */
  dualCore: boolean;
  /** 旋臂数量 1..5（随成长与 DNA 尾迹倾向增多）。 */
  arms: number;
  /** 阶段标签（可视化参考）：初生 / 成形 / 环生 / 双核。 */
  stage: 'nascent' | 'formed' | 'ringed' | 'dual';
  /** 活跃粒子乘数 0.7..1.8（随成长增多，填充变大的身体体积）。 */
  particleMul: number;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

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

    const ring = clamp01((growth - 0.55) / 0.35);
    const dualCore = growth >= 0.85;
    // 旋臂：成长过半后逐渐长出，数量受 DNA 尾迹倾向影响（1..5）。
    const arms = Math.round(clamp01((growth - 0.4) / 0.45) * (1 + inputs.tailProbability * 3)) + 1;
    const stage =
      growth < 0.3 ? 'nascent' : growth < 0.55 ? 'formed' : growth < 0.85 ? 'ringed' : 'dual';

    return {
      growth,
      ring,
      dualCore,
      arms,
      stage,
      // 成长后体积（环/双核/旋臂）变大，粒子要跟上否则发稀。
      particleMul: 0.7 + 1.1 * growth,
    };
  }
}
