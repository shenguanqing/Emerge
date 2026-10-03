/**
 * 首次引导完成标记：独立于生命存档（镜像桌面端 onboarding.json 的语义）。
 * 已有生命存档但无标记的老用户视为升级用户，不再强制重走引导；
 * 标记损坏按「未完成」处理，下次启动仍可进入引导。
 * core 模块纯 TypeScript，存储通过 StorageLike 注入。
 */

import type { StorageLike } from './LifeStorage';

export const ONBOARDING_STORAGE_KEY = 'emerge.onboarding.v1';

export function loadOnboardingState(storage: StorageLike): { completed: boolean } | null {
  try {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { completed?: unknown };
    if (typeof parsed?.completed !== 'boolean') return null;
    return { completed: parsed.completed };
  } catch {
    return null;
  }
}

export function saveOnboardingState(storage: StorageLike, completed: boolean): void {
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 1, completed }));
  } catch {
    /* 存储不可用时仅本次生效 */
  }
}

export function isOnboardingDone(storage: StorageLike): boolean {
  return loadOnboardingState(storage)?.completed === true;
}

/**
 * 本次启动是否需要进入引导；副作用与桌面端一致：
 * 升级用户（已有生命、无标记）直接补写完成标记；首次用户先落「未完成」标记。
 */
export function shouldShowOnboarding(storage: StorageLike, existingLife: boolean): boolean {
  const state = loadOnboardingState(storage);
  if (state?.completed) return false;
  if (existingLife && !state) {
    saveOnboardingState(storage, true);
    return false;
  }
  if (!state) saveOnboardingState(storage, false);
  return true;
}
