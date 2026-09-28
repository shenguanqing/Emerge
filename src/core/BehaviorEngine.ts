/**
 * 行为引擎：把连续情绪参数转译为宏观行为意图。
 * 三种状态（Curious / Scared / Calm）是平滑权重，不是互斥片段；
 * 自主 Idle 由慢速游走 + 偶发能量脉冲构成，无输入仍有生命感。
 * core 模块纯 TypeScript，不依赖渲染器与 DOM。
 */
import type { EmotionState } from './EmotionEngine';
import type { PointerReading } from './PointerPerception';

export interface BehaviorOutputs {
  /** 状态权重 0..1（可同时非零，为连续权重）。 */
  calm: number;
  curious: number;
  scared: number;
  /** 受惊收缩 0..1：身体锚点收缩幅度。 */
  contract: number;
  /** 核心宏观位置目标（已含好奇趋近 / 受惊回避偏置）。 */
  coreTarget: [number, number, number];
  /** 指针排斥乘数（信任高且好奇时温和靠近，排斥降低）。 */
  pointerPushMul: number;
}

function lag(cur: number, target: number, dt: number, tau: number): number {
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export class BehaviorEngine {
  private core: [number, number, number] = [0, 0, 0];
  private contract = 0;
  private calm = 1;
  private curious = 0;
  private scared = 0;
  private initialized = false;

  /** 受惊收缩上升 tau（秒）。 */
  contractRiseTau = 0.35;
  /** 受惊收缩消退 tau（秒）。 */
  contractFallTau = 1.6;

  update(
    dt: number,
    emotion: EmotionState,
    pointer: PointerReading,
    driftPos: [number, number, number],
    driftSpeed: number,
  ): BehaviorOutputs {
    // ---- 状态权重：由连续参数导出，永远平滑 ----
    this.scared = lag(this.scared, smoothstep(0.22, 0.65, emotion.stress), dt, 0.45);
    this.curious = lag(
      this.curious,
      smoothstep(0.3, 0.7, emotion.curiosity) * (1 - this.scared),
      dt,
      0.9,
    );
    this.calm = lag(this.calm, clamp01(1 - Math.max(this.scared, this.curious * 0.7)), dt, 1.2);

    // ---- 受惊收缩：快速收紧、缓慢释放 ----
    const contractTarget = this.scared * 0.85;
    const cTau = contractTarget > this.contract ? this.contractRiseTau : this.contractFallTau;
    this.contract = lag(this.contract, contractTarget, dt, cTau);

    // ---- 核心意图：自主漂移 + 好奇趋近 + 受惊回避 ----
    if (!this.initialized) {
      this.core = [...driftPos] as [number, number, number];
      this.initialized = true;
    }
    let tx = driftPos[0] * (0.5 + 0.5 * emotion.activity);
    let ty = driftPos[1] * (0.5 + 0.5 * emotion.activity);
    let tz = driftPos[2] * (0.5 + 0.5 * emotion.activity);

    if (pointer.active) {
      // 好奇：核心向指针方向试探性移动（不超过 30% 距离）。
      const k = 0.3 * this.curious;
      tx += (pointer.world[0] - tx) * k;
      ty += (pointer.world[1] - ty) * k;
      // 受惊：向指针反方向退避。
      const away = 1.1 * this.scared;
      const dx = this.core[0] - pointer.world[0];
      const dy = this.core[1] - pointer.world[1];
      const len = Math.hypot(dx, dy) + 1e-4;
      tx += (dx / len) * away;
      ty += (dy / len) * away;
    }
    // 漂移速度受 activity 调制（lag 由核心跟随 tau 体现）。
    void driftSpeed;
    this.core[0] = lag(this.core[0], tx, dt, 0.9);
    this.core[1] = lag(this.core[1], ty, dt, 0.9);
    this.core[2] = lag(this.core[2], tz, dt, 1.2);

    // ---- 指针排斥乘数：信任 + 好奇 → 温和靠近；受惊 → 加强保持距离 ----
    const familiarity = clamp01(emotion.trust * (0.4 + 0.6 * this.curious));
    const pointerPushMul = clamp01(1 - 0.45 * familiarity + this.scared * 0.5);

    return {
      calm: this.calm,
      curious: this.curious,
      scared: this.scared,
      contract: this.contract,
      coreTarget: [this.core[0], this.core[1], this.core[2]],
      pointerPushMul,
    };
  }
}
