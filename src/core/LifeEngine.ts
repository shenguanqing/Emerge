import { createLifeState, type LifeParams, type LifeState } from './types';
import { PointerPerception, type PointerReading } from './PointerPerception';
import { EmotionEngine } from './EmotionEngine';
import { BehaviorEngine } from './BehaviorEngine';
import { MemoryEngine } from './MemoryEngine';
import { GrowthEngine } from './GrowthEngine';
import { timeOfDay } from './TimeSystem';
import type { LifeDNA } from './DNAEngine';

/** 生命上下文：DNA + 记忆 + 成长（可选；缺省时为无记忆的裸引擎）。 */
export interface LifeContext {
  dna: LifeDNA;
  memory: MemoryEngine;
  growth: GrowthEngine;
}

/**
 * 生命引擎：唯一持有模拟时钟与生命状态。
 * 固定步长语义由调用方保证；dt 过大时钳制（休眠恢复/切回标签页），
 * 避免状态跳变。不依赖渲染器、Vue 或 DOM。
 */
export class LifeEngine {
  private readonly state: LifeState;
  private readonly perception = new PointerPerception();
  private readonly emotion: EmotionEngine;
  private readonly behavior = new BehaviorEngine();
  private readonly memory: MemoryEngine | null = null;
  private readonly growth: GrowthEngine | null = null;
  private readonly dna: LifeDNA | null = null;
  private lastScatter = 0;
  private pointerReading: PointerReading = {
    active: false,
    world: [0, 0, 99],
    worldVel: [0, 0, 0],
  };
  private scatter = 0;
  private wary = 0;
  private pressRamp = 0;
  private clickPulse = 0;
  private clickPos: [number, number, number] = [0, 0, 0];
  private pressing = false;
  private sleepiness = 0;
  private greetScatter = 0;
  private sleepyBoost = 0;

  constructor(private readonly params: LifeParams, life?: LifeContext) {
    this.state = createLifeState();
    this.emotion = new EmotionEngine(params.energyBase, params.curiosityBase, params.trustBase);
    if (life) {
      this.memory = life.memory;
      this.growth = life.growth;
      this.dna = life.dna;
      this.state.symmetry = life.dna.symmetry;
      this.state.lifeId = life.dna.id;
      this.memory.beginSession(new Date());
      this.state.growth = life.growth.state.growth;
      this.state.ring = life.growth.state.ring;
      this.state.dualCore = life.growth.state.dualCore ? 1 : 0;
    }
  }

  /** 离线回归问候：根据离开时长设定「重新凝聚 + 苏醒」的初始强度。 */
  wakeFromOffline(elapsedMinutes: number): void {
    this.greetScatter = Math.min(Math.max(elapsedMinutes / 240, 0), 1);
    this.sleepyBoost = Math.min(Math.max(elapsedMinutes / 360, 0), 0.7) * 0.8;
  }

  /** 提供最新原始指针读数；感知延迟在 update 内平滑。 */
  setPointer(reading: PointerReading): void {
    this.pointerReading = reading;
  }

  /** 长按状态（吸引场随斜坡渐入渐出）。 */
  setPress(pressing: boolean): void {
    this.pressing = pressing;
  }

  /** 点击事件：在指定世界坐标产生涟漪冲击。 */
  click(x: number, y: number, z: number): void {
    this.clickPos = [x, y, z];
    this.clickPulse = 1;
  }

  /** 只读状态快照，供渲染层消费。 */
  getState(): LifeState {
    return this.state;
  }

  /** 推进模拟。 */
  update(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.state.time += dt;
    this.state.revealT += dt;

    // 启动凝聚：0.8s 黑场铺垫后旋涡收拢，smoothstep 缓入缓出。
    const raw = Math.min(
      Math.max((this.state.revealT - 0.8) / this.params.coalesceSeconds, 0),
      1,
    );
    this.state.formMix = raw * raw * (3 - 2 * raw);

    // 指针感知：指数滞后产生反应延迟（tau 见 PointerPerception）。
    this.perception.update(this.pointerReading, dt);
    const perceived = this.perception.perceived;
    this.state.pointerPos = perceived.world;
    this.state.pointerVel = perceived.worldVel;
    this.state.pointerActive = this.perception.activityLevel;

    // 受惊散开：感知指针速度超过阈值时快速上升，随后指数消退；
    // 刚度在消退中逐渐恢复，形成 2–4 秒的旋涡式重组。
    const speed = Math.hypot(perceived.worldVel[0], perceived.worldVel[1], perceived.worldVel[2]);
    const shockSpeed = Math.max(0, speed - this.params.scatterSpeed) / this.params.scatterSpeed;
    if (shockSpeed > 0) {
      this.scatter = Math.min(1, this.scatter + shockSpeed * dt * 4);
      this.wary = Math.max(this.wary, Math.min(1, shockSpeed));
    }
    this.scatter *= Math.exp(-dt / this.params.scatterRecoverTau);
    if (this.scatter < 0.005) this.scatter = 0;
    this.wary *= Math.exp(-dt / this.params.waryTau);
    if (this.wary < 0.005) this.wary = 0;
    this.state.scatter = this.scatter;
    this.state.wary = this.wary;

    // ---- 情绪与行为：连续参数驱动状态权重（无互斥切换） ----
    const shock = Math.max(0, this.scatter - this.lastScatter);
    this.lastScatter = this.scatter;
    const perceivedSpeed = Math.hypot(
      perceived.worldVel[0], perceived.worldVel[1], perceived.worldVel[2]);
    const dist = Math.hypot(
      perceived.world[0] - this.state.corePosition[0],
      perceived.world[1] - this.state.corePosition[1]);
    this.emotion.update({
      dt,
      pointerActive: this.state.pointerActive,
      pointerSpeed: perceivedSpeed,
      pointerDist: dist,
      shock,
      time: this.state.time,
    });
    const em = this.emotion.state;

    // 自主漂移基线：慢速三轴 Lissajous 游走（行为系统在此之上叠加情绪偏置）。
    const t = this.state.time * this.params.driftSpeed;
    const r = this.params.driftRadius;
    const driftPos: [number, number, number] = [
      Math.sin(t * 0.7) * r,
      Math.sin(t * 1.1 + 1.3) * r * 0.6,
      Math.cos(t * 0.9) * r * 0.4,
    ];
    const behavior = this.behavior.update(dt, em, perceived, driftPos, this.params.driftSpeed);
    this.state.corePosition = behavior.coreTarget;
    this.state.energy = em.energy;
    this.state.stress = em.stress;
    this.state.curious = behavior.curious;
    this.state.scared = behavior.scared;
    this.state.calm = behavior.calm;
    this.state.contract = behavior.contract;
    this.state.moodShift = em.mood;
    this.state.pointerPushMul = behavior.pointerPushMul;

    // ---- 长按吸引与点击涟漪 ----
    const pressTarget = this.pressing && this.state.pointerActive > 0.3 ? 1 : 0;
    const pressTau = pressTarget > this.pressRamp ? 0.12 : 0.4;
    this.pressRamp += (pressTarget - this.pressRamp) * (1 - Math.exp(-dt / pressTau));
    this.clickPulse *= Math.exp(-dt / 0.45);
    if (this.clickPulse < 0.01) this.clickPulse = 0;
    this.state.pressRamp = this.pressRamp;
    this.state.clickPulse = this.clickPulse;
    this.state.clickPos = this.clickPos;
    this.state.pulseBoost = this.emotion.pulseLevel;

    // 长按把玩：核心被手指牵引（渐进倾斜，非瞬移）。
    if (this.pressRamp > 0.01 && this.state.pointerActive > 0.3) {
      const pull = (1 - Math.exp(-dt / 0.6)) * 0.5 * this.pressRamp;
      for (let i = 0; i < 3; i += 1) {
        this.state.corePosition[i] +=
          (perceived.world[i] - this.state.corePosition[i]) * pull;
      }
    }

    // ---- 现实时间：昼夜影响睡眠倾向、亮度与活动量 ----
    const tod = timeOfDay(new Date());
    this.sleepyBoost *= Math.exp(-dt / 60);
    const sleepTarget = Math.min(1, tod.sleepinessTarget * 0.6 + this.sleepyBoost);
    this.sleepiness += (sleepTarget - this.sleepiness) * (1 - Math.exp(-dt / 8));
    this.state.sleepiness = this.sleepiness;
    let brightness = tod.brightness * (1 - 0.35 * this.sleepiness);
    if (this.memory && (tod.phase === 'night' || tod.phase === 'lateNight')) {
      brightness *= 1 + this.memory.nightGlow * 0.3; // 夜猫子：夜间更亮
    }
    this.state.brightness = Math.min(brightness, 1.2);

    // 呼吸速率随睡眠倾向放缓（深夜呼吸悠长）。
    const rateMul = 1 - 0.55 * this.sleepiness;
    this.state.breathPhase = this.params.breathRate * rateMul * this.state.time * Math.PI * 2;
    this.state.breathWave = 0.5 - 0.5 * Math.cos(this.state.breathPhase);
    this.state.breathScale = 1 + this.params.breathAmplitude * this.state.breathWave;

    // ---- 记忆与成长：长期使用塑造性格与形态 ----
    if (this.memory) {
      this.memory.tick({
        dt,
        active: this.state.pointerActive > 0.3,
        pointerSpeed: perceivedSpeed,
        shock,
        night: tod.phase === 'lateNight',
      });
    }
    if (this.growth && this.memory) {
      this.growth.update({
        days: this.memory.growthInputs.days,
        interactionMinutes: this.memory.state.interactionMinutes,
        growthBias: this.dna ? this.dna.growthBias : 0.5,
      });
      const g = this.growth.state;
      this.state.growth = g.growth;
      this.state.ring = g.ring;
      this.state.dualCore = g.dualCore ? 1 : 0;
      // 第二核心绕主核心缓慢环绕。
      const t2 = this.state.time * 0.13;
      this.state.core2Offset = [
        Math.sin(t2) * 1.15,
        0.18 * Math.sin(t2 * 1.7),
        Math.cos(t2 * 0.9) * 1.15,
      ];
    }

    // 离线问候：回归时生命体从松散中重新凝聚、逐渐亮起。
    this.greetScatter *= Math.exp(-dt / 2.2);
    if (this.greetScatter < 0.01) this.greetScatter = 0;
    this.state.scatter = Math.max(this.scatter, this.greetScatter);
  }
}
