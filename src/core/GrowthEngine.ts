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
  /** DNA 成长倾向 0..1。 */
  growthBias: number;
}

export interface GrowthState {
  /** 成长进度 0..1。 */
  growth: number;
  /** 环结构显示量 0..1（成长后期出现的行星环）。 */
  ring: number;
  /** 双核心是否解锁。 */
  dualCore: boolean;
  /** 阶段标签（可视化参考）：初生 / 成形 / 环生 / 双核。 */
  stage: 'nascent' | 'formed' | 'ringed' | 'dual';
  /** 活跃粒子乘数 0.85..1.25（随成长增多）。 */
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
    // 互动 4 小时贡献 60%，陪伴 14 天贡献 40%；growthBias 调整体感速度。
    const interact = clamp01(inputs.interactionMinutes / 240) * 0.6;
    const days = clamp01((inputs.days - 1) / 14) * 0.4;
    const speed = 0.7 + 0.6 * inputs.growthBias;
    const growth = clamp01((interact + days) * speed);

    const ring = clamp01((growth - 0.55) / 0.35);
    const dualCore = growth >= 0.85;
    const stage =
      growth < 0.3 ? 'nascent' : growth < 0.55 ? 'formed' : growth < 0.85 ? 'ringed' : 'dual';

    return {
      growth,
      ring,
      dualCore,
      stage,
      particleMul: 0.85 + 0.4 * growth,
    };
  }
}
