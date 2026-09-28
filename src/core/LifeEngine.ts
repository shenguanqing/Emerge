import { createLifeState, type LifeParams, type LifeState } from './types';

/**
 * 生命引擎：唯一持有模拟时钟与生命状态。
 * 固定步长语义由调用方保证；dt 过大时钳制（休眠恢复/切回标签页），
 * 避免状态跳变。不依赖渲染器、Vue 或 DOM。
 */
export class LifeEngine {
  private readonly state: LifeState;

  constructor(private readonly params: LifeParams) {
    this.state = createLifeState();
  }

  /** 只读状态快照，供渲染层消费。 */
  getState(): LifeState {
    return this.state;
  }

  /** 推进模拟。 */
  update(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.state.time += dt;

    // 呼吸：相位连续累积，缩放 = 1 + amplitude · (0.5 − 0.5·cos 2π·rate·t)，
    // 平滑经过 1 → 1+amp → 1，无硬切换。
    this.state.breathPhase = this.params.breathRate * this.state.time * Math.PI * 2;
    this.state.breathScale =
      1 + this.params.breathAmplitude * (0.5 - 0.5 * Math.cos(this.state.breathPhase));

    // 核心自主漂移：慢速三轴 Lissajous 游走（Phase 7 由行为系统接管驱动）。
    const t = this.state.time * this.params.driftSpeed;
    const r = this.params.driftRadius;
    this.state.corePosition[0] = Math.sin(t * 0.7) * r;
    this.state.corePosition[1] = Math.sin(t * 1.1 + 1.3) * r * 0.6;
    this.state.corePosition[2] = Math.cos(t * 0.9) * r * 0.4;
  }
}
