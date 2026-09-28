import type { PointerReading } from '../core/PointerPerception';

/**
 * 指针系统：把鼠标当作物理对象，记录位置与速度，并换算到生命体世界
 * （z=0 平面，与渲染相机 fov 50°、距离 7 一致）。
 */
export class PointerSystem {
  readonly position = { x: 0, y: 0 };
  readonly velocity = { x: 0, y: 0 };
  private viewportW = 1;
  private viewportH = 1;
  private inCanvas = false;

  private target: HTMLElement | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private sinceMove = 0;

  /** 相机常量：与渲染后端保持一致（fov 50°，相机在 z=7）。 */
  private static readonly FOV_Y = (50 * Math.PI) / 180;
  private static readonly CAM_DIST = 7;

  /** 视口 CSS 尺寸（App resize 时调用）。 */
  setViewport(w: number, h: number): void {
    this.viewportW = Math.max(w, 1);
    this.viewportH = Math.max(h, 1);
  }

  /** 换算到世界坐标的当前读数。 */
  getReading(): PointerReading {
    const worldPerPx =
      (2 * Math.tan(PointerSystem.FOV_Y / 2) * PointerSystem.CAM_DIST) / this.viewportH;
    const aspect = this.viewportW / this.viewportH;
    const ndcX = (this.position.x / this.viewportW) * 2 - 1;
    const ndcY = -((this.position.y / this.viewportH) * 2 - 1);
    const halfW = Math.tan(PointerSystem.FOV_Y / 2) * PointerSystem.CAM_DIST * aspect;
    const halfH = Math.tan(PointerSystem.FOV_Y / 2) * PointerSystem.CAM_DIST;
    return {
      active: this.inCanvas,
      world: [ndcX * halfW, ndcY * halfH, 0],
      worldVel: [this.velocity.x * worldPerPx, -this.velocity.y * worldPerPx, 0],
    };
  }

  private readonly onMove = (event: PointerEvent) => {
    // 合成事件（自动化拖拽）可能不触发 pointerenter，move 本身即在场证明。
    this.inCanvas = true;
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
    this.sinceMove = 0;
  };

  /**
   * 每帧调用：指针停止移动时速度自然衰减到 0。
   * 若不衰减，最后一次移动的速度会永久冻结，导致生命体持续受惊。
   */
  tick(dt: number): void {
    this.sinceMove += dt;
    if (this.sinceMove > 0.06) {
      const k = Math.exp(-dt / 0.12);
      this.velocity.x *= k;
      this.velocity.y *= k;
      if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
      if (Math.abs(this.velocity.y) < 0.01) this.velocity.y = 0;
    }
  }

  private readonly onEnter = () => {
    this.inCanvas = true;
  };

  private readonly onLeave = () => {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.inCanvas = false;
  };

  attach(target: HTMLElement): void {
    this.detach();
    this.target = target;
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerenter', this.onEnter);
    target.addEventListener('pointerleave', this.onLeave);
    this.inCanvas = true;
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerenter', this.onEnter);
    this.target.removeEventListener('pointerleave', this.onLeave);
    this.target = null;
  }

  dispose(): void {
    this.detach();
  }
}
