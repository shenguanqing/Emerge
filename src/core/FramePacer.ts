/** 保留限帧余量，模拟使用两次实际渲染间隔；暂停时不追赶历史帧。 */
export class FramePacer {
  private budget = 0;
  private elapsed = 0;
  reset(): void { this.budget = 0; this.elapsed = 0; }
  step(dt: number, fps: number): number | null {
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.25) { this.reset(); return null; }
    this.budget += dt;
    this.elapsed += dt;
    const interval = 1 / fps;
    if (this.budget + 0.0005 < interval) return null;
    this.budget = Math.max(0, this.budget - interval) % interval;
    const elapsed = Math.min(this.elapsed, 0.1);
    this.elapsed = 0;
    return elapsed;
  }
}
