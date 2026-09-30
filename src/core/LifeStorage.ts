/**
 * 生命存储：DNA、记忆、成长与最近活跃时间的持久化。
 * Web 用 localStorage；桌面（Tauri WebView）同样可用 localStorage，
 * 平台差异由适配器决定是否迁移到文件（后续阶段）。
 * core 模块纯 TypeScript，不依赖渲染器或 Vue。
 */

import type { LifeDNA } from './DNAEngine';
import { createMemoryState, type MemoryState } from './MemoryEngine';

export const STORAGE_KEY = 'emerge.life.v1';
export const SCHEMA_VERSION = 2;

export interface LifeSnapshot {
  schemaVersion: number;
  dna: LifeDNA;
  memory: MemoryState;
  /** 最近活跃时间（epoch 毫秒）。 */
  lastActiveTime: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 内存实现（测试与降级用）。 */
export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** 浏览器 localStorage（不可用时静默降级为内存实现）。 */
export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // 隐私模式等场景，降级内存。
  }
  return new MemoryStorage();
}

export function saveLife(storage: StorageLike, snapshot: LifeSnapshot): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export type LoadResult =
  | { ok: true; snapshot: LifeSnapshot }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'corrupt'; detail: string }
  | { ok: false; reason: 'schema'; detail: string };

export function loadLife(storage: StorageLike): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ok: false, reason: 'empty' };
  try {
    const parsed = JSON.parse(raw) as LifeSnapshot;
    if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, reason: 'schema', detail: `version=${parsed.schemaVersion}` };
    }
    if (!parsed.dna || !parsed.memory || typeof parsed.lastActiveTime !== 'number') {
      return { ok: false, reason: 'corrupt', detail: 'missing fields' };
    }
    const m = parsed.memory;
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const keys = ['totalMinutes', 'interactionMinutes', 'gentleMinutes', 'scareCount', 'nightMinutes'] as const;
    if (!Number.isFinite(parsed.lastActiveTime) || !finite(parsed.dna.growthBias)
      || !finite(parsed.dna.tailProbability) || !finite(parsed.dna.bornAt)
      || typeof parsed.dna.id !== 'string' || !Array.isArray(m.daysSeen)
      || !m.daysSeen.every(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day))
      || typeof m.lastVisitDay !== 'string' || !keys.every(key => finite(m[key]))) {
      return { ok: false, reason: 'corrupt', detail: 'invalid memory or DNA' };
    }
    if (parsed.schemaVersion === 1) {
      // 保留旧身份与累计记录，旧公式计算出的成长度作为永久下限。
      const legacyGrowth = Math.min(1, (Math.min(m.interactionMinutes / 240, 1) * 0.6
        + Math.min(Math.max((m.daysSeen.length - 1) / 14, 0), 1) * 0.4)
        * (0.7 + 0.6 * parsed.dna.growthBias));
      parsed.memory = { ...createMemoryState(new Date(parsed.lastActiveTime)), ...m,
        schemaVersion: 2, musicMinutes: 0, musicCredit: 0,
        interactionCredit: m.interactionMinutes, growthFloor: legacyGrowth,
        daily: { day: m.lastVisitDay, musicMinutes: 0, interactionMinutes: 0 } };
      parsed.schemaVersion = SCHEMA_VERSION;
    } else if (m.schemaVersion !== 2 || ![m.musicMinutes, m.musicCredit, m.interactionCredit, m.growthFloor].every(finite)
      || m.growthFloor > 1 || !m.daily || typeof m.daily.day !== 'string'
      || !finite(m.daily.musicMinutes) || !finite(m.daily.interactionMinutes)) {
      return { ok: false, reason: 'corrupt', detail: 'invalid growth counters' };
    }
    return { ok: true, snapshot: parsed };
  } catch (e) {
    return { ok: false, reason: 'corrupt', detail: String(e) };
  }
}

/** 清除存档（损坏时的自愈路径：重新诞生一个新生命）。 */
export function clearLife(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}
