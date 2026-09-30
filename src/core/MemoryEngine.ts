/**
 * 记忆引擎：聚合长期使用数据（不用 AI API）。
 * 记录陪伴时长、互动方式、活跃时段与受惊次数，输出性格修正。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export interface MemoryState {
  schemaVersion: 2;
  /** 启动过的不同天数（YYYY-MM-DD 去重）。 */
  daysSeen: string[];
  /** 累计陪伴分钟。 */
  totalMinutes: number;
  /** 累计有效温和互动分钟（附近真实动作或短暂回应）。 */
  interactionMinutes: number;
  /** 累计温和互动分钟（低速平稳互动）。 */
  gentleMinutes: number;
  /** 受惊次数（scatter 触发）。 */
  scareCount: number;
  /** 夜间使用分钟（23:00–5:00）。 */
  nightMinutes: number;
  /** 最近一次会话日期。 */
  lastVisitDay: string;
  musicMinutes: number;
  musicCredit: number;
  interactionCredit: number;
  growthFloor: number;
  daily: { day: string; musicMinutes: number; interactionMinutes: number };

}

export function createMemoryState(now: Date): MemoryState {
  const day = dayKey(now);
  return {
    schemaVersion: 2,
    daysSeen: [day],
    totalMinutes: 0,
    interactionMinutes: 0,
    gentleMinutes: 0,
    scareCount: 0,
    nightMinutes: 0,
    lastVisitDay: day,
    musicMinutes: 0, musicCredit: 0, interactionCredit: 0, growthFloor: 0,
    daily: { day, musicMinutes: 0, interactionMinutes: 0 },
  };
}

export function dayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export interface MemoryTick {
  dt: number;
  /** 指针活跃。 */
  active: boolean;
  /** 感知指针速度（世界单位/秒）。 */
  pointerSpeed: number;
  /** 本帧新增受惊冲击。 */
  shock: number;
  /** 当前是否夜间（23:00–5:00）。 */
  night: boolean;
  visible?: boolean;
  engaged?: boolean;
  musicActive?: boolean;
  musicEnergy?: number;
  date?: Date;
  /** 持续音频门控用真实秒数，时间加速不能把短音效变成音乐。 */
  realDt?: number;
}

export class MemoryEngine {
  readonly state: MemoryState;
  private audibleSeconds = 0;

  constructor(state: MemoryState) {
    this.state = state;
  }

  /** 会话开始：登记访问天数（连续陪伴在读取侧由 daysSeen 推导）。 */
  beginSession(now: Date): void {
    const day = dayKey(now);
    if (!this.state.daysSeen.includes(day)) {
      this.state.daysSeen.push(day);
      if (this.state.daysSeen.length > 400) this.state.daysSeen.shift();
    }
    this.state.lastVisitDay = day;
  }

  tick(inp: MemoryTick): void {
    if (inp.visible === false || !Number.isFinite(inp.dt) || inp.dt <= 0) {
      this.audibleSeconds = 0;
      return;
    }
    if (inp.date) this.beginSession(inp.date);
    const day = this.state.lastVisitDay;
    // 只在日期向前推进时换日，回拨系统时间不能重复领取每日高权重。
    if (day > this.state.daily.day) this.state.daily = { day, musicMinutes: 0, interactionMinutes: 0 };
    const minutes = inp.dt / 60;
    this.state.totalMinutes += minutes;
    const gentle = inp.active && inp.pointerSpeed < 1.5 && inp.shock === 0
      && (inp.pointerSpeed > 0.02 || inp.engaged === true);
    if (gentle) {
      this.state.interactionMinutes += minutes;
      this.state.gentleMinutes += minutes;
      const before = this.state.daily.interactionMinutes;
      this.state.daily.interactionMinutes += minutes;
      this.state.interactionCredit += dailyCredit(before + minutes, 20) - dailyCredit(before, 20);
    }
    const audible = inp.musicActive === true && Number.isFinite(inp.musicEnergy) && inp.musicEnergy! > 0.04;
    const realDt = Math.max(0, inp.realDt ?? inp.dt);
    const beforeAudible = this.audibleSeconds;
    this.audibleSeconds = audible ? beforeAudible + realDt : 0;
    // 连续两秒有声音才计时；不按音量或节拍数加分。
    if (audible && this.audibleSeconds > 2 && realDt > 0) {
      const eligible = Math.min(realDt, this.audibleSeconds - 2) / realDt * minutes;
      this.state.musicMinutes += eligible;
      const before = this.state.daily.musicMinutes;
      this.state.daily.musicMinutes += eligible;
      this.state.musicCredit += dailyCredit(before + eligible, 30) - dailyCredit(before, 30);
    }
    if (inp.shock > 0.3) this.state.scareCount += 1;
    if (inp.night) this.state.nightMinutes += minutes;
  }

  /** 信任修正 0..0.25：温和互动越多、受惊越少 → 越信任。 */
  get trustBonus(): number {
    const s = this.state;
    const gentle = clamp01(s.gentleMinutes / 90);
    const scares = clamp01(s.scareCount / 40);
    return clamp01(gentle * 0.3 - scares * 0.05);
  }

  /** 夜间发光倾向 0..1：夜间使用越多越明显。 */
  get nightGlow(): number {
    return clamp01(this.state.nightMinutes / 180);
  }

  /** 成长输入：陪伴天数与互动分钟归一。 */
  get growthInputs() {
    return { days: this.state.daysSeen.length, interactionMinutes: this.state.interactionCredit,
      companionMinutes: this.state.totalMinutes, musicMinutes: this.state.musicCredit,
      growthFloor: this.state.growthFloor };
  }

  get musicAffinity(): number { return clamp01(this.state.musicMinutes / 180); }
}

/** 每日前 limit 分钟全额计分，之后指数递减、最多再贡献 10 分钟。 */
export function dailyCredit(minutes: number, limit: number): number {
  return Math.min(minutes, limit) + (minutes > limit ? 10 * (1 - Math.exp(-(minutes - limit) / 30)) : 0);
}
