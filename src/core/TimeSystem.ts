/**
 * 时间系统：生命体知道现实时间。
 * 晨/昼/暮/夜/深夜 影响亮度、活动量与睡眠倾向。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export type DayPhase = 'morning' | 'day' | 'evening' | 'night' | 'lateNight';

export interface TimeOfDay {
  /** 24 小时制小时（0–23.99）。 */
  hours: number;
  phase: DayPhase;
  /** 睡眠倾向 0..1（深夜最高）。 */
  sleepinessTarget: number;
  /** 环境亮度乘 0..1（深夜最暗）。 */
  brightness: number;
  /** 活动量乘 0..1。 */
  activity: number;
}

export function timeOfDay(now: Date): TimeOfDay {
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

  // 23–5 深夜：沉睡倾向最强；21–23 与 5–7 夜/晨过渡；白天最活跃。
  if (hours >= 23 || hours < 5) {
    return { hours, phase: 'lateNight', sleepinessTarget: 0.85, brightness: 0.45, activity: 0.25 };
  }
  if (hours >= 21) {
    return { hours, phase: 'night', sleepinessTarget: 0.45, brightness: 0.7, activity: 0.55 };
  }
  if (hours < 7) {
    return { hours, phase: 'morning', sleepinessTarget: 0.4, brightness: 0.75, activity: 0.6 };
  }
  if (hours >= 18) {
    return { hours, phase: 'evening', sleepinessTarget: 0.2, brightness: 0.85, activity: 0.8 };
  }
  return { hours, phase: 'day', sleepinessTarget: 0.1, brightness: 1, activity: 1 };
}
