/**
 * 指针感知：把原始指针读数平滑为生命体「感觉到」的指针。
 * 反应延迟通过指数滞后实现（tau ≈ 180ms），让生命体不会瞬时响应，
 * 更像生物。core 模块纯 TypeScript，不依赖 DOM。
 */
export interface PointerReading {
  /** 是否活跃（指针在可视区域内）。 */
  active: boolean;
  /** 指针世界坐标（z=0 平面，与渲染相机一致）。 */
  world: [number, number, number];
  /** 指针世界速度（世界单位/秒）。 */
  worldVel: [number, number, number];
}

function lag(current: number, target: number, dt: number, tau: number): number {
  const k = 1 - Math.exp(-dt / tau);
  return current + (target - current) * k;
}

export class PointerPerception {
  private pos: [number, number, number] = [0, 0, 0];
  private vel: [number, number, number] = [0, 0, 0];
  private active = 0;
  private initialized = false;

  /** 位置感知延迟（秒）。 */
  posTau = 0.18;
  /** 速度感知延迟（秒），比位置更迟钝。 */
  velTau = 0.26;

  update(raw: PointerReading, dt: number): void {
    if (!this.initialized && raw.active) {
      this.pos = [...raw.world] as [number, number, number];
      this.initialized = true;
    }
    this.active = lag(this.active, raw.active ? 1 : 0, dt, 0.12);
    this.pos[0] = lag(this.pos[0], raw.world[0], dt, this.posTau);
    this.pos[1] = lag(this.pos[1], raw.world[1], dt, this.posTau);
    this.pos[2] = lag(this.pos[2], raw.world[2], dt, this.posTau);
    this.vel[0] = lag(this.vel[0], raw.worldVel[0], dt, this.velTau);
    this.vel[1] = lag(this.vel[1], raw.worldVel[1], dt, this.velTau);
    this.vel[2] = lag(this.vel[2], raw.worldVel[2], dt, this.velTau);
  }

  get perceived(): PointerReading {
    return {
      active: this.active > 0.35,
      world: [this.pos[0], this.pos[1], this.pos[2]],
      worldVel: [this.vel[0], this.vel[1], this.vel[2]],
    };
  }

  /** 感知活跃度 0..1（供连续行为参数使用）。 */
  get activityLevel(): number {
    return this.active;
  }
}
