/**
 * 行为引擎：把连续情绪参数转译为宏观行为意图。
 * 八种状态（Calm / Curious / Scared / Explore / Excited / Sleepy / Playful / Lonely）
 * 都是平滑权重，不是互斥片段；自主 Idle 由慢速游走 + 偶发能量脉冲构成，无输入仍有生命感。
 * 新五态只经核心目标、收缩、排斥与跟随速度表达，不新增渲染 uniform。
 * core 模块纯 TypeScript，不依赖渲染器与 DOM。
 */
import type { EmotionState } from './EmotionEngine';
import type { PointerReading } from './PointerPerception';

export interface BehaviorOutputs {
  /** 状态权重 0..1（可同时非零，为连续权重）。 */
  calm: number;
  curious: number;
  scared: number;
  explore: number;
  excited: number;
  sleepy: number;
  playful: number;
  lonely: number;
  /** 受惊收缩 0..1：身体锚点收缩幅度（困倦/孤独轻微内收叠加）。 */
  contract: number;
  /** 核心宏观位置目标（已含好奇趋近 / 受惊回避偏置）。 */
  coreTarget: [number, number, number];
  /** 指针排斥乘数（信任高且好奇时温和靠近，排斥降低）。 */
  pointerPushMul: number;
}

/** LifeEngine 透传的上一帧派生量（避免引擎间循环依赖）。 */
export interface BehaviorExtras {
  /** 上一帧 arousal：自发脉冲 / 点击涟漪 / 长按斜坡取最大，供 excited 使用。 */
  arousal: number;
  /** LifeEngine 现实昼夜 sleepiness，供 sleepy 使用。 */
  sleepiness: number;
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
  private explore = 0;
  private excited = 0;
  private sleepy = 0;
  private playful = 0;
  private lonely = 0;
  /** 无指针累计秒数（指针出现即清零，供 lonely 使用）。 */
  private quiet = 0;
  private initialized = false;

  /** 受惊收缩上升 tau（秒）。 */
  contractRiseTau = 0.35;
  /** 受惊收缩消退 tau（秒）。 */
  contractFallTau = 1.6;
  /** lonely 计时起点（秒）：超过后开始显现。 */
  lonelyStartSec = 180;
  /** lonely 计时满值（秒）：达到后权重为 1。 */
  lonelyFullSec = 900;

  update(
    dt: number,
    emotion: EmotionState,
    pointer: PointerReading,
    driftPos: [number, number, number],
    driftSpeed: number,
    extras: BehaviorExtras = { arousal: 0, sleepiness: 0 },
  ): BehaviorOutputs {
    // ---- 状态权重：由连续参数导出，永远平滑 ----
    this.scared = lag(this.scared, smoothstep(0.22, 0.65, emotion.stress), dt, 0.45);
    this.curious = lag(
      this.curious,
      smoothstep(0.3, 0.7, emotion.curiosity) * (1 - this.scared),
      dt,
      0.9,
    );
    // sleepy 先算：后续低唤醒抑制都以前一帧 sleepy 为准，避免同帧顺序依赖。
    this.sleepy = lag(this.sleepy, smoothstep(0.5, 0.85, extras.sleepiness), dt, 1.5);
    this.excited = lag(
      this.excited,
      smoothstep(0.55, 0.85, Math.max(emotion.energy, extras.arousal))
        * (1 - this.scared) * (1 - 0.7 * this.sleepy),
      dt,
      0.6,
    );
    const pointerSpeed = Math.hypot(pointer.worldVel[0], pointer.worldVel[1], pointer.worldVel[2]);
    const gentle = pointer.active ? clamp01(1 - pointerSpeed / 1.5) : 0;
    this.playful = lag(
      this.playful,
      smoothstep(0.5, 0.8, emotion.trust * (0.35 + 0.65 * gentle))
        * (1 - this.scared) * (1 - this.sleepy),
      dt,
      0.8,
    );
    this.explore = lag(
      this.explore,
      smoothstep(0.45, 0.75, emotion.activity) * (pointer.active ? 0 : 1)
        * (1 - this.scared) * (1 - this.sleepy),
      dt,
      1.4,
    );
    if (pointer.active) this.quiet = 0;
    else this.quiet += Math.max(0, dt);
    const lonelyFull = Math.max(this.lonelyFullSec, this.lonelyStartSec + 1);
    this.lonely = lag(
      this.lonely,
      smoothstep(this.lonelyStartSec, lonelyFull, this.quiet)
        * (1 - this.sleepy) * (1 - this.scared),
      dt,
      2.0,
    );
    this.calm = lag(
      this.calm,
      clamp01(1 - Math.max(
        this.scared, this.curious * 0.7, this.excited * 0.8, this.playful * 0.6,
        this.explore * 0.5, this.sleepy, this.lonely * 0.5,
      )),
      dt,
      1.2,
    );

    // ---- 受惊收缩：快速收紧、缓慢释放；困倦/孤独轻微内收叠加 ----
    const contractTarget = Math.min(1, this.scared * 0.85 + this.sleepy * 0.15 + this.lonely * 0.1);
    const cTau = contractTarget > this.contract ? this.contractRiseTau : this.contractFallTau;
    this.contract = lag(this.contract, contractTarget, dt, cTau);

    // ---- 核心意图：自主漂移 + 好奇趋近 + 受惊回避 ----
    if (!this.initialized) {
      this.core = [...driftPos] as [number, number, number];
      this.initialized = true;
    }
    // 漫游幅度：探索时扩大，困倦/孤独时收拢回家。
    const roam = (1 + 1.2 * this.explore) * (1 - 0.8 * this.sleepy) * (1 - 0.6 * this.lonely);
    const driftAmp = 0.5 + 0.5 * emotion.activity;
    let tx = driftPos[0] * driftAmp * roam;
    let ty = driftPos[1] * driftAmp * roam;
    let tz = driftPos[2] * driftAmp * roam;
    // 跟随速度：兴奋/嬉戏更灵，困倦/孤独更迟。
    const followTau = Math.min(2.2, Math.max(0.4,
      0.9 - 0.45 * this.excited - 0.3 * this.playful + 0.8 * this.sleepy + 0.4 * this.lonely));

    if (pointer.active) {
      // 好奇：核心向指针方向试探性移动；兴奋/嬉戏时更敢靠近，困倦时无视。
      const k = this.curious * (0.3 + 0.3 * this.excited + 0.25 * this.playful) * (1 - this.sleepy);
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
    this.core[0] = lag(this.core[0], tx, dt, followTau);
    this.core[1] = lag(this.core[1], ty, dt, followTau);
    this.core[2] = lag(this.core[2], tz, dt, followTau + 0.3);

    // ---- 指针排斥乘数：信任 + 好奇 → 温和靠近；受惊 → 加强保持距离 ----
    const familiarity = clamp01(emotion.trust * (0.4 + 0.6 * this.curious));
    const pointerPushMul = Math.min(1.5, Math.max(0.55,
      1 - 0.45 * familiarity + this.scared * 0.5 - 0.1 * this.excited + 0.1 * this.lonely));

    return {
      calm: this.calm,
      curious: this.curious,
      scared: this.scared,
      explore: this.explore,
      excited: this.excited,
      sleepy: this.sleepy,
      playful: this.playful,
      lonely: this.lonely,
      contract: this.contract,
      coreTarget: [this.core[0], this.core[1], this.core[2]],
      pointerPushMul,
    };
  }
}
