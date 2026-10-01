import { createLifeState, type LifeParams, type LifeState } from './types';
import { PointerPerception, type PointerReading } from './PointerPerception';
import { EmotionEngine } from './EmotionEngine';
import { BehaviorEngine } from './BehaviorEngine';
import { MemoryEngine } from './MemoryEngine';
import { GrowthEngine, formStage } from './GrowthEngine';
import { timeOfDay } from './TimeSystem';
import { dayKey } from './MemoryEngine';
import type { MusicFeatures } from '../input/AudioSystem';
import { AttentionEngine } from './AttentionEngine';
import { LifeClock } from './LifeClock';
import type { LifeDNA } from './DNAEngine';

/** 生命上下文：DNA + 记忆 + 成长（可选；缺省时为无记忆的裸引擎）。 */
export interface LifeContext {
  dna: LifeDNA;
  memory: MemoryEngine;
  growth: GrowthEngine;
  /** 虚拟生命时钟（时间倍率/快进）；缺省为真实时间。 */
  clock?: LifeClock;
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
  private readonly attention: AttentionEngine;
  private readonly memory: MemoryEngine | null = null;
  private readonly growth: GrowthEngine | null = null;
  private readonly dna: LifeDNA | null = null;
  private readonly clock: LifeClock;
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
  private music: MusicFeatures = {
    active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false,
  };
  private sleepiness = 0;
  private beatFlash = 0;
  private greetScatter = 0;
  private sleepyBoost = 0;
  /** 放置位置：漂移围绕此点，可拖到屏幕任意处。 */
  private home: [number, number, number] = [0, 0, 0];
  private positionLocked = false;
  private visible = true;
  private interactionRadius = 2;
  private engagedUntil = 0;
  private lastEngagement = -10;
  private nearbyClick = false;

  setVisible(visible: boolean): void { this.visible = visible; }
  setInteractionScale(scale: number): void { this.interactionRadius = Math.max(0.2, 0.85 * scale * 2.6); }
  getGrowthSummary() {
    const m = this.memory?.state;
    return m ? { lifeId: this.state.lifeId, growth: this.state.growth, companionMinutes: m.totalMinutes,
      interactionMinutes: m.interactionMinutes, musicMinutes: m.musicMinutes,
      musicToday: m.daily.musicMinutes, days: m.daysSeen.length,
      musicAffinity: this.memory!.musicAffinity, trust: this.memory!.trustBonus } : null;
  }

  constructor(private readonly params: LifeParams, life?: LifeContext) {
    this.state = createLifeState();
    this.attention = new AttentionEngine(life?.dna.seed ?? 0.5);
    this.emotion = new EmotionEngine(params.energyBase, params.curiosityBase, params.trustBase);
    this.clock = life?.clock ?? new LifeClock(1);
    if (life) {
      this.memory = life.memory;
      this.growth = life.growth;
      this.dna = life.dna;
      this.state.symmetry = life.dna.symmetry;
      this.state.lifeId = life.dna.id;
      this.memory.beginSession(this.clock.date());
      this.state.growth = life.growth.state.growth;
      this.state.form = { ...life.growth.state.form };
      this.state.stage = life.growth.state.stage;
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

  /** 喂入音乐特征：生命体在"听音乐"（Bass 脉冲 / Beat 能量波 / 高能兴奋）。 */
  setMusic(features: MusicFeatures): void {
    this.music = features;
  }

  /** 点击事件：在指定世界坐标产生涟漪冲击。 */
  click(x: number, y: number, z: number): void {
    this.nearbyClick = Math.hypot(x - this.state.corePosition[0], y - this.state.corePosition[1]) <= this.interactionRadius;
    this.clickPos = [x, y, z];
    this.clickPulse = 1;
  }

  /** 平台提供初始停留点；不依赖屏幕或窗口 API。 */
  setHome(position: [number, number, number]): void {
    this.home = [...position];
    this.state.corePosition = [...position];
  }

  /** 位置锁定：核心停在当前位置，不再自主漂移。 */
  setPositionLocked(locked: boolean): void {
    this.positionLocked = locked;
    if (locked) {
      this.home = [...this.state.corePosition] as [number, number, number];
    }
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
    // 与情绪感知的 6 世界单位范围一致；远处全局鼠标不能惊散身体。
    // 使用原始位置限定作用范围，防止平滑位置滞后造成离开后继续受惊。
    const pointerDistance = Math.hypot(
      this.pointerReading.world[0] - this.state.corePosition[0],
      this.pointerReading.world[1] - this.state.corePosition[1],
    );
    const proximity = Math.max(0, Math.min(1, (6 - pointerDistance) / 4));
    const influence = this.pointerReading.active && perceived.active
      ? proximity * proximity * (3 - 2 * proximity)
      : 0;
    const shockSpeed = Math.max(0, speed - this.params.scatterSpeed)
      / this.params.scatterSpeed * influence;
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

    // 自主漂移基线：围绕「放置点」home 做慢速三轴游走；锁定时半径为 0。
    const t = this.state.time * this.params.driftSpeed;
    const r = this.positionLocked ? 0 : this.params.driftRadius;
    const driftPos: [number, number, number] = [
      this.home[0] + Math.sin(t * 0.7) * r,
      this.home[1] + Math.sin(t * 1.1 + 1.3) * r * 0.6,
      this.home[2] + Math.cos(t * 0.9) * r * 0.4,
    ];
    const behavior = this.behavior.update(dt, em, perceived, driftPos, this.params.driftSpeed);
    this.state.corePosition = this.positionLocked
      ? ([...this.home] as [number, number, number])
      : behavior.coreTarget;
    this.state.energy = em.energy;
    this.state.stress = em.stress;
    this.state.curious = Math.min(1, behavior.curious + (this.memory?.trustBonus ?? 0) * this.state.pointerActive);
    this.state.scared = behavior.scared;
    this.state.calm = behavior.calm;
    this.state.contract = behavior.contract;
    this.state.moodShift = em.mood;
    this.state.pointerPushMul = behavior.pointerPushMul * (1 - (this.memory?.trustBonus ?? 0) * 0.4);

    const nearAttention = this.pointerReading.active
      ? Math.max(0, 1 - pointerDistance / (this.interactionRadius * 1.8)) : 0;
    this.attention.update(dt, nearAttention,
      Math.atan2(perceived.world[1] - this.state.corePosition[1], perceived.world[0] - this.state.corePosition[0]),
      this.state.scared, this.state.sleepiness);
    Object.assign(this.state, this.attention.state);

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

    // 长按拖拽放置：按住牵引核心到目标位置（渐进，非瞬移）；锁定时不动。
    if (!this.positionLocked && this.pressRamp > 0.05 && this.state.pointerActive > 0.25) {
      // 按住越稳跟随越紧，松手后 home 停在最近放置点。
      const pull = (1 - Math.exp(-dt / 0.22)) * this.pressRamp;
      for (let i = 0; i < 3; i += 1) {
        const delta = (perceived.world[i] - this.state.corePosition[i]) * pull;
        this.state.corePosition[i] += delta;
        this.home[i] += delta * 0.85;
      }
    }

    // ---- 现实时间：昼夜影响睡眠倾向、亮度与活动量（随生命时钟加速） ----
    const vnow = this.clock.date();
    // 虚拟日期跨天：登记新的陪伴日（timelapse 下一天只需真实几分钟）。
    if (this.visible && this.memory && dayKey(vnow) !== this.memory.state.lastVisitDay) {
      this.memory.beginSession(vnow);
    }
    const tod = timeOfDay(vnow);
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
      const near = this.pointerReading.active && pointerDistance <= this.interactionRadius;
      const rawSpeed = Math.hypot(...this.pointerReading.worldVel);
      const movingGently = near && rawSpeed > 0.02 && rawSpeed < 1.5;
      if (this.visible && (movingGently || (near && this.nearbyClick && this.state.time - this.lastEngagement >= 2))) {
        this.engagedUntil = this.state.time + 2;
        this.lastEngagement = this.state.time;
      }
      this.nearbyClick = false;
      if (!this.visible || !near) this.engagedUntil = 0;
      this.memory.tick({
        dt: dt * this.clock.scale, realDt: dt, date: vnow,
        visible: this.visible, active: near,
        engaged: this.state.time < this.engagedUntil,
        pointerSpeed: rawSpeed, shock,
        night: tod.phase === 'lateNight',
        musicActive: this.music.active, musicEnergy: this.music.energy,
      });
    }
    if (this.growth && this.memory) {
      this.growth.update({
        ...this.memory.growthInputs,
        growthBias: this.dna ? this.dna.growthBias : 0.5,
        tailProbability: this.dna ? this.dna.tailProbability : 0.5,
      });
      const g = this.growth.state;
      this.state.growth = g.growth;
      this.memory.state.growthFloor = g.growth;
      this.state.form = { ...g.form };
      this.state.stage = g.stage;
    }

    // ---- 听音乐：Bass 身体脉冲 / Beat 核心能量波 / 高能兴奋、安静平静 ----
    const m = this.music;
    this.state.musicActive = m.active ? 1 : 0;
    // 静音死区：刚打开监听、环境底噪时不要改形态，避免「一点监听就变了」。
    const bass = m.active && m.bass > 0.03 ? m.bass : 0;
    const treble = m.active && m.treble > 0.03 ? m.treble : 0;
    const energy = m.active && m.energy > 0.04 ? m.energy : 0;
    this.state.musicBass = bass;
    this.state.musicTreble = treble * (0.8 + 0.2 * (this.memory?.musicAffinity ?? 0));
    this.state.musicEnergy = energy;
    if (energy > 0 || bass > 0) {
      // Bass → 身体明显脉冲（呼吸缩放），量感加大，听感才清楚。
      this.state.breathScale += bass * 0.42 + energy * 0.08;
      // Beat → 核心能量波（更亮更持久）；仅真实节拍触发。
      if (m.beat && energy > 0.05) this.beatFlash = 1;
      // 高能 → 兴奋抬升更明显。
      this.state.energy = Math.min(1, this.state.energy + energy * 0.55);
      // 中低频把体表「吹」开一点，让鼓点有体积感。
      this.state.moodShift = Math.min(1, this.state.moodShift + bass * 0.25);
    }
    this.beatFlash *= Math.exp(-dt / 0.42);
    // 脉冲可视化：音乐节拍优先，保证可见；静音不叠脉冲。
    this.state.pulseBoost = Math.max(
      this.emotion.pulseLevel,
      this.beatFlash,
      energy > 0.04 ? energy * 0.45 : 0,
    );

    // 离线问候：回归时生命体从松散中重新凝聚、逐渐亮起。
    this.greetScatter *= Math.exp(-dt / 2.2);
    if (this.greetScatter < 0.01) this.greetScatter = 0;
    this.state.scatter = Math.max(this.scatter, this.greetScatter);

    // 年龄与阶段：随虚拟时钟实时更新（诊断/把玩反馈可见）。
    if (this.dna) {
      this.state.ageDays = Math.max(
        0, Math.floor((this.clock.now() - this.dna.bornAt) / 86400000));
      this.state.stage = formStage(this.state.growth);
    }
  }
}
