/**
 * 指针系统：把鼠标当作物理对象，记录位置与速度（CSS 像素坐标）。
 * Phase 5 由力场消费速度与接近度；Phase 1 只负责可靠采集与平滑。
 */
export class PointerSystem {
  readonly position = { x: 0, y: 0 };
  readonly velocity = { x: 0, y: 0 };

  private target: HTMLElement | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;

  private readonly onMove = (event: PointerEvent) => {
    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.max((now - this.lastTime) / 1000, 1 / 240) : 1 / 60;
    const prevX = this.lastX;
    const prevY = this.lastY;
    this.position.x = event.clientX;
    this.position.y = event.clientY;
    // 指数平滑速度，抑制抖动尖峰；单位 CSS 像素/秒。
    const k = 0.35;
    this.velocity.x += ((event.clientX - prevX) / dt - this.velocity.x) * k;
    this.velocity.y += ((event.clientY - prevY) / dt - this.velocity.y) * k;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.lastTime = now;
  };

  private readonly onLeave = () => {
    this.velocity.x = 0;
    this.velocity.y = 0;
  };

  attach(target: HTMLElement): void {
    this.detach();
    this.target = target;
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerleave', this.onLeave);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerleave', this.onLeave);
    this.target = null;
  }

  dispose(): void {
    this.detach();
  }
}
