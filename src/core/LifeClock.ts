/**
 * 生命时钟：虚拟时间 = 真实流逝 × 时间倍率。
 * timelapse 模式下，现实几分钟可以走完生命体的几天；
 * scale = 1 时与真实时间一致（默认）。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export class LifeClock {
  /** 时间倍率（可运行时调整：隐藏调试入口的时间加速）。 */
  scale: number;
  private readonly realStart: number;
  private readonly virtualStart: number;
  /** 额外的虚拟偏移（毫秒），调试面板「快进」直接累加。 */
  private extraOffset = 0;

  constructor(scale = 1, now: number = Date.now()) {
    this.scale = Math.max(scale, 0.001);
    this.realStart = now;
    this.virtualStart = now;
  }

  /** 当前虚拟时间（epoch 毫秒）。 */
  now(): number {
    return (
      this.virtualStart +
      (Date.now() - this.realStart) * this.scale +
      this.extraOffset
    );
  }

  /** 快进虚拟时间（毫秒，可为负）。 */
  advance(ms: number): void {
    this.extraOffset += ms;
  }

  /** 运行时调整时间倍率（隐藏入口的时间加速）。 */
  setScale(scale: number): void {
    this.scale = Math.max(scale, 0.001);
  }

  /** 虚拟日期对象。 */
  date(): Date {
    return new Date(this.now());
  }
}
