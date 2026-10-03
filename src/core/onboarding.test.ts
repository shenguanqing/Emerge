import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from './LifeStorage';
import {
  isOnboardingDone,
  loadOnboardingState,
  ONBOARDING_STORAGE_KEY,
  saveOnboardingState,
  shouldShowOnboarding,
} from './onboarding';

test('首次用户：落未完成标记并进入引导，完成后不再进入', () => {
  const storage = new MemoryStorage();
  assert.ok(shouldShowOnboarding(storage, false), '无标记且无存档应进入引导');
  assert.deepEqual(loadOnboardingState(storage), { completed: false });
  assert.ok(shouldShowOnboarding(storage, false), '未完成标记期间应重复进入引导');
  saveOnboardingState(storage, true);
  assert.ok(isOnboardingDone(storage));
  assert.ok(!shouldShowOnboarding(storage, false), '完成后不再进入引导');
});

test('升级用户：已有生命存档但无标记，补写完成标记且不进引导', () => {
  const storage = new MemoryStorage();
  assert.ok(!shouldShowOnboarding(storage, true));
  assert.deepEqual(loadOnboardingState(storage), { completed: true });
  assert.ok(!shouldShowOnboarding(storage, true), '补写后重启不再进入引导');
});

test('完成标记在重复读写间保持稳定，损坏数据按未完成处理', () => {
  const storage = new MemoryStorage();
  saveOnboardingState(storage, true);
  assert.ok(isOnboardingDone(storage), '标记可跨会话保留');
  storage.setItem(ONBOARDING_STORAGE_KEY, '{broken json');
  assert.equal(loadOnboardingState(storage), null);
  assert.ok(shouldShowOnboarding(storage, false), '损坏标记视同首次用户');
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 1 }));
  assert.ok(shouldShowOnboarding(storage, false), '缺 completed 字段视同未完成');
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 1, completed: 'yes' }));
  assert.ok(shouldShowOnboarding(storage, false), '非法 completed 类型视同未完成');
});
