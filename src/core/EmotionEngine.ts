/**
 * 情绪引擎：连续参数驱动，状态是参数上的权重而非互斥动画片段。
 * 所有参数用指数滞后平滑更新，杜绝瞬间切换。
 * core 模块纯 TypeScript，不依赖渲染器与 DOM。
 */
export interface EmotionInputs {
  /** 帧间隔（秒，已钳制）。 */
  dt: number;
  /** 感知指针活跃度 0..1。 */
  pointerActive: number;
  /** 感知指针速度（世界单位/秒）。 */
  pointerSpeed: number;
  /** 感知指针到核心的距离（世界单位）。 */
  pointerDist: number;
  /** 本帧新增的受惊冲击量（由 LifeEngine 从 scatter 上升量折算）。 */
  shock: number;
  /** 模拟累计时间（秒），用于自主节律。 */
  time: number;
}

export interface EmotionState {
  energy: number;
  curiosity: number;
  trust: number;
  stress: number;
  sleepiness: number;
  activity: number;
  mood: number;
}

export function createEmotionState(energyBase: number, curiosityBase: number, trustBase: number): EmotionState {
  return {
    energy: energyBase,
    curiosity: curiosityBase,
    trust: trustBase,
    stress: 0,
    sleepiness: 0.15,
    activity: 0.4,
    mood: 0.5,
  };
}

function lag(cur: number, target: number, dt: number, tau: number): number {
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export class EmotionEngine {
  readonly state: EmotionState;
  private readonly energyBaseValue: number;
  /** 自主能量脉冲（BehaviorEngine 触发，随时间消退）。 */
  private pulse = 0;
  /** 下一一次自发脉冲的剩余秒数。 */
  private pulseCountdown = 14;

  constructor(
    energyBase: number,
    curiosityBase: number,
    trustBase: number,
  ) {
    this.state = createEmotionState(energyBase, curiosityBase, trustBase);
    this.energyBaseValue = energyBase;
  }

  update(inp: EmotionInputs): void {
    const dt = inp.dt;
    const s = this.state;

    // ---- 自主节律：无输入时也有能量起伏与偶发脉冲 ----
    this.pulseCountdown -= dt;
    if (this.pulseCountdown <= 0) {
      this.pulse = 1;
      this.pulseCountdown = 9 + 11 * fract(Math.sin(inp.time * 12.9898) * 43758.5453);
    }
    this.pulse *= Math.exp(-dt / 2.6);

    // ---- stress：受惊冲击立即抬升，缓慢消退 ----
    if (inp.shock > 0) {
      s.stress = clamp01(s.stress + inp.shock * 0.85);
    }
    s.stress *= Math.exp(-dt / 2.8);

    // ---- energy：基线 + 慢周期漂移 + 交互与脉冲抬升，闲置缓慢回落 ----
    const drift = 0.14 * Math.sin(inp.time * 0.16) + 0.08 * Math.sin(inp.time * 0.043 + 2.0);
    const energyTarget = clamp01(
      this.energyBaseValue + drift + this.pulse * 0.35 + inp.pointerActive * 0.18,
    );
    s.energy = lag(s.energy, energyTarget, dt, 6);
    if (inp.shock > 0) s.energy = clamp01(s.energy + inp.shock * 0.25);

    // ---- curiosity：有指针且低速接近时上升；受惊时显著下降 ----
    const proximity = clamp01(1 - inp.pointerDist / 6);
    const curiosityTarget = clamp01(
      inp.pointerActive * (0.25 + 0.75 * proximity) * (1 - s.stress * 0.9) * (0.4 + 0.6 * s.trust),
    );
    const curTau = curiosityTarget > s.curiosity ? 1.6 : 2.8;
    s.curiosity = lag(s.curiosity, curiosityTarget, dt, curTau);

    // ---- trust：缓慢而持久的参数——平稳互动累计，受惊扣减 ----
    const calmEngage =
      inp.pointerActive * clamp01(1 - inp.pointerSpeed / 1.5) * (1 - s.stress) * dt;
    s.trust = clamp01(s.trust + calmEngage * 0.02 - inp.shock * 0.12);

    // ---- sleepiness：MVP 保持低位慢漂移；Phase 10 由现实昼夜驱动 ----
    s.sleepiness = clamp01(0.12 + 0.1 * Math.sin(inp.time * 0.021 + 1.0));

    // ---- activity / mood：由以上参数合成 ----
    s.activity = clamp01(0.22 + s.energy * 0.5 + s.curiosity * 0.3 - s.stress * 0.25);
    s.mood = clamp01(0.32 + s.energy * 0.3 + s.trust * 0.2 - s.stress * 0.55);
  }
}

function fract(v: number): number {
  return v - Math.floor(v);
}
