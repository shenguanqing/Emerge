/**
 * 生命存储：DNA、记忆、成长与最近活跃时间的持久化。
 * Web 用 localStorage；桌面（Tauri WebView）同样可用 localStorage，
 * 平台差异由适配器决定是否迁移到文件（后续阶段）。
 * core 模块纯 TypeScript，不依赖渲染器或 Vue。
 */

import type { LifeDNA } from './DNAEngine';
import type { MemoryState } from './MemoryEngine';

export const STORAGE_KEY = 'emerge.life.v1';
export const SCHEMA_VERSION = 1;

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
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      return { ok: false, reason: 'schema', detail: `version=${parsed.schemaVersion}` };
    }
    if (!parsed.dna || !parsed.memory || typeof parsed.lastActiveTime !== 'number') {
      return { ok: false, reason: 'corrupt', detail: 'missing fields' };
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
