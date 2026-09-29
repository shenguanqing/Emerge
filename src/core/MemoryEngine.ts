/**
 * 记忆引擎：聚合长期使用数据（不用 AI API）。
 * 记录陪伴时长、互动方式、活跃时段与受惊次数，输出性格修正。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export interface MemoryState {
  schemaVersion: 1;
  /** 启动过的不同天数（YYYY-MM-DD 去重）。 */
  daysSeen: string[];
  /** 累计陪伴分钟。 */
  totalMinutes: number;
  /** 累计互动分钟（指针活跃）。 */
  interactionMinutes: number;
  /** 累计温和互动分钟（低速平稳互动）。 */
  gentleMinutes: number;
  /** 受惊次数（scatter 触发）。 */
  scareCount: number;
  /** 夜间使用分钟（23:00–5:00）。 */
  nightMinutes: number;
  /** 最近一次会话日期。 */
  lastVisitDay: string;
}

export function createMemoryState(now: Date): MemoryState {
  const day = dayKey(now);
  return {
    schemaVersion: 1,
    daysSeen: [day],
    totalMinutes: 0,
    interactionMinutes: 0,
    gentleMinutes: 0,
    scareCount: 0,
    nightMinutes: 0,
    lastVisitDay: day,
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
}

export class MemoryEngine {
  readonly state: MemoryState;

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
    const minutes = inp.dt / 60;
    this.state.totalMinutes += minutes;
    if (inp.active) {
      this.state.interactionMinutes += minutes;
      if (inp.pointerSpeed < 1.5) this.state.gentleMinutes += minutes;
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
  get growthInputs(): { days: number; interactionMinutes: number } {
    return { days: this.state.daysSeen.length, interactionMinutes: this.state.interactionMinutes };
  }
}
