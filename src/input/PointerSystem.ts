import type { PointerReading } from '../core/PointerPerception';
import {
  cssToWorldOnViewPlane,
  DEFAULT_CAMERA,
  FOV_Y,
  type OrbitCamera,
} from '../render/ViewState';

/**
 * 指针系统：把鼠标当作物理对象，记录位置与速度，并换算到生命体世界
 * （与渲染相机 fov 50° 一致；观察空间旋转后按当前视平面反投影）。
 */
export class PointerSystem {
  private drag: { x: number; y: number; active: boolean } | null = null;
  constructor(private readonly orbit?: {
    hit(x: number, y: number): boolean;
    move(dx: number, dy: number): void;
  }) {}

  isDragging(): boolean { return this.drag?.active ?? false; }

  readonly position = { x: 0, y: 0 };
  readonly velocity = { x: 0, y: 0 };
  private viewportW = 1;
  private viewportH = 1;
  private inCanvas = false;
  private camera: OrbitCamera = { ...DEFAULT_CAMERA };

  /** 最近一次指针活动的时间戳（performance.now）。 */
  lastActivity = 0;
  private pressing = false;
  private pendingClick: { x: number; y: number; t: number } | null = null;
  private readyClick: { x: number; y: number; z: number } | null = null;
  private doubleArmed = false;
  private doublePos: { x: number; y: number } | null = null;
  private lastClickDone: { x: number; y: number; t: number } | null = null;

  private target: HTMLElement | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private sinceMove = 0;

  /** 视口 CSS 尺寸（App resize 时调用）。 */
  setViewport(w: number, h: number): void {
    this.viewportW = Math.max(w, 1);
    this.viewportH = Math.max(h, 1);
  }

  /** 同步观察相机（进出 Observatory / 旋转缩放时）。 */
  setCamera(cam: OrbitCamera): void {
    this.camera = cam;
  }

  /** CSS 像素 → 生命体世界坐标（当前相机视平面）。 */
  private cssToWorld(x: number, y: number): [number, number, number] {
    return cssToWorldOnViewPlane(this.camera, x, y, this.viewportW, this.viewportH);
  }

  /** 换算到世界坐标的当前读数。 */
  getReading(): PointerReading {
    const camDist = this.camera.distance;
    const worldPerPx =
      (2 * Math.tan(FOV_Y / 2) * camDist) / this.viewportH;
    const world = this.cssToWorld(this.position.x, this.position.y);
    return {
      active: this.inCanvas,
      world,
      worldVel: [this.velocity.x * worldPerPx, -this.velocity.y * worldPerPx, 0],
    };
  }

  private readonly onMove = (event: PointerEvent) => {
    // 合成事件（自动化拖拽）可能不触发 pointerenter，move 本身即在场证明。
    this.ingest(event.clientX, event.clientY, true);
  };

  /**
   * 注入指针位置（DOM 事件或穿透模式下的全局跟踪）。
   * `near` 为 false 表示鼠标远离窗口，生命体可忽略。
   */
  ingest(x: number, y: number, near: boolean): void {
    if (this.drag) {
      const dx = x - this.drag.x;
      const dy = y - this.drag.y;
      if (this.drag.active || Math.hypot(dx, dy) >= 5) {
        this.clearGestures();
        this.drag = { x, y, active: true };
        this.orbit?.move(dx, dy);
      }
    }
    this.inCanvas = near;
    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.max((now - this.lastTime) / 1000, 1 / 240) : 1 / 60;
    const prevX = this.lastX;
    const prevY = this.lastY;
    this.position.x = x;
    this.position.y = y;
    // 指数平滑速度，抑制抖动尖峰；单位 CSS 像素/秒。
    const k = 0.35;
    this.velocity.x += ((x - prevX) / dt - this.velocity.x) * k;
    this.velocity.y += ((y - prevY) / dt - this.velocity.y) * k;
    if (this.isDragging()) {
      this.velocity.x = 0;
      this.velocity.y = 0;
    }
    this.lastX = x;
    this.lastY = y;
    this.lastTime = now;
    this.lastActivity = now;
    this.sinceMove = 0;
  }

  /** 注入左键按下（与 DOM pointerdown 同一语义）。 */
  press(x: number, y: number, near = true): void {
    this.ingest(x, y, near);
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.pressing = true;
    this.drag = this.orbit?.hit(x, y) ? { x, y, active: false } : null;
    const now = performance.now();
    const nearDouble = (px: number, py: number, t: number) =>
      now - t < 300 && Math.hypot(x - px, y - py) < 48;

    // 双击：300ms 内、落点接近的两次按下（含第一次已抬起的情形）。
    if (this.pendingClick && nearDouble(this.pendingClick.x, this.pendingClick.y, this.pendingClick.t)) {
      this.pendingClick = null;
      this.readyClick = null;
      this.doubleArmed = true;
      this.doublePos = { x, y };
    } else if (this.lastClickDone && nearDouble(this.lastClickDone.x, this.lastClickDone.y, this.lastClickDone.t)) {
      this.readyClick = null;
      this.lastClickDone = null;
      this.doubleArmed = true;
      this.doublePos = { x, y };
    } else {
      this.pendingClick = { x, y, t: now };
    }
    this.lastActivity = now;
  }

  /** 注入左键抬起。 */
  release(): void {
    this.drag = null;
    this.pressing = false;
    // 抬起即放行单击涟漪：反馈要即时，双击由 press 侧拦截。
    this.flushClick();
  }

  private flushClick(): void {
    if (!this.pendingClick) return;
    const css = this.pendingClick;
    this.pendingClick = null;
    this.lastClickDone = { x: css.x, y: css.y, t: performance.now() };
    const world = this.cssToWorld(css.x, css.y);
    this.readyClick = { x: world[0], y: world[1], z: world[2] };
  }

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
    this.lastActivity = performance.now();
  };

  private readonly onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    try { this.target?.setPointerCapture(event.pointerId); } catch { /* 合成输入没有活动指针。 */ }
    this.press(event.clientX, event.clientY, true);
  };

  private readonly onUp = () => {
    this.release();
  };

  /** 是否正在按住（长按吸引场）。 */
  isPressing(): boolean {
    return this.pressing;
  }

  /** 取出已放行的单击涟漪（抬起即放行；丢 up 事件时 400ms 兜底）。 */
  consumeClick(): { x: number; y: number; z: number } | null {
    if (this.pendingClick && performance.now() - this.pendingClick.t > 400) {
      this.flushClick();
    }
    const hit = this.readyClick;
    this.readyClick = null;
    return hit;
  }

  /** 消费一次双击（300ms 内、落点接近的两次按下）；返回双击的 CSS 坐标；不触发单击涟漪。 */
  consumeDoubleClick(): { x: number; y: number } | null {
    if (!this.doubleArmed) return null;
    this.doubleArmed = false;
    const pos = this.doublePos;
    this.doublePos = null;
    return pos;
  }

  /** 输入模式切换时丢弃旧手势，避免 DOM 与全局双击重复触发。 */
  clearGestures(): void {
    this.drag = null;
    this.pressing = false;
    this.pendingClick = null;
    this.readyClick = null;
    this.doubleArmed = false;
    this.doublePos = null;
    this.lastClickDone = null;
  }

  private readonly onCaptureLost = () => { if (this.drag || this.pressing) this.clearGestures(); };

  private readonly onCancel = () => { this.clearGestures(); };

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
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onCancel);
    target.addEventListener('lostpointercapture', this.onCaptureLost);
    window.addEventListener('blur', this.onCancel);
    this.inCanvas = true;
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerenter', this.onEnter);
    this.target.removeEventListener('pointerleave', this.onLeave);
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointercancel', this.onCancel);
    this.target.removeEventListener('lostpointercapture', this.onCaptureLost);
    window.removeEventListener('blur', this.onCancel);
    this.target = null;
    this.clearGestures();
  }

  dispose(): void {
    this.detach();
  }
}
