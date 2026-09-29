// 核心逻辑测试：确定性随机、持久化往返、成长单调、昼夜相位。
// 运行：npm run test:core
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDNAFromSeed, mulberry32 } from './DNAEngine';
import { MemoryEngine, createMemoryState, dayKey } from './MemoryEngine';
import { GrowthEngine } from './GrowthEngine';
import {
  MemoryStorage,
  loadLife,
  saveLife,
  clearLife,
  STORAGE_KEY,
} from './LifeStorage';
import { timeOfDay } from './TimeSystem';

test('DNA：同一种子生成完全相同的 DNA', () => {
  const a = generateDNAFromSeed(0.4242, 1700000000000);
  const b = generateDNAFromSeed(0.4242, 1700000000000);
  assert.deepEqual(a, b);
});

test('DNA：不同种子产生不同 Life ID 与参数', () => {
  const a = generateDNAFromSeed(0.1, 1);
  const b = generateDNAFromSeed(0.9, 1);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.symmetry, b.symmetry);
});

test('mulberry32：同种子序列确定且在 [0,1)', () => {
  const r1 = mulberry32(0.5);
  const r2 = mulberry32(0.5);
  for (let i = 0; i < 100; i++) {
    const v = r1();
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, r2());
  }
});

test('存储：快照往返保持字段', () => {
  const storage = new MemoryStorage();
  const snapshot = {
    schemaVersion: 1,
    dna: generateDNAFromSeed(0.3, 1700000000000),
    memory: createMemoryState(new Date(1700000000000)),
    lastActiveTime: 1700000000000,
  };
  snapshot.memory.totalMinutes = 42;
  saveLife(storage, snapshot);
  const loaded = loadLife(storage);
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.snapshot.dna.id, snapshot.dna.id);
    assert.equal(loaded.snapshot.memory.totalMinutes, 42);
    assert.equal(loaded.snapshot.lastActiveTime, 1700000000000);
  }
});

test('存储：空存档返回 empty，损坏返回 corrupt', () => {
  const storage = new MemoryStorage();
  const empty = loadLife(storage);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reason, 'empty');
  storage.setItem(STORAGE_KEY, '{not json');
  const corrupt = loadLife(storage);
  assert.equal(corrupt.ok, false);
  if (!corrupt.ok) assert.equal(corrupt.reason, 'corrupt');
  clearLife(storage);
  const cleared = loadLife(storage);
  assert.equal(cleared.ok, false);
  if (!cleared.ok) assert.equal(cleared.reason, 'empty');
});

test('记忆：温和互动累计信任输入，受惊累计计数', () => {
  const memory = new MemoryEngine(createMemoryState(new Date(1700000000000)));
  // 2 小时温和互动（43.2 万帧 @60fps）：信任按设计缓慢累计（90 分钟满值）。
  for (let i = 0; i < 432000; i++) {
    memory.tick({ dt: 1 / 60, active: true, pointerSpeed: 0.5, shock: 0, night: false });
  }
  // 5 分钟惊吓：推高受惊计数并压低信任。
  for (let i = 0; i < 18000; i++) {
    memory.tick({ dt: 1 / 60, active: true, pointerSpeed: 6, shock: 1, night: true });
  }
  assert.ok(memory.state.gentleMinutes > 110);
  assert.ok(memory.state.scareCount >= 15000);
  const noScares = new MemoryEngine(createMemoryState(new Date(1700000000000)));
  for (let i = 0; i < 432000; i++) {
    noScares.tick({ dt: 1 / 60, active: true, pointerSpeed: 0.5, shock: 0, night: false });
  }
  assert.ok(noScares.trustBonus > memory.trustBonus); // 受惊应降低信任
  assert.ok(memory.trustBonus > 0.2); // 两小时温和互动应有可观的信任
  assert.ok(memory.nightGlow > 0.02); // 5 分钟夜间使用（满值 180 分钟）
});

test('成长：互动与天数单调推进且封顶', () => {
  const g = new GrowthEngine({ days: 1, interactionMinutes: 0, growthBias: 0.5 });
  let prev = g.state.growth;
  for (let m = 30; m <= 600; m += 30) {
    g.update({ days: 1 + m / 120, interactionMinutes: m, growthBias: 0.5 });
    assert.ok(g.state.growth >= prev);
    prev = g.state.growth;
  }
  assert.ok(g.state.growth <= 1);
  assert.equal(typeof g.state.stage, 'string');
});

test('时间：深夜睡意最强、白天最活跃', () => {
  const late = timeOfDay(new Date(2026, 8, 28, 2, 0));
  const day = timeOfDay(new Date(2026, 8, 28, 14, 0));
  assert.equal(late.phase, 'lateNight');
  assert.equal(day.phase, 'day');
  assert.ok(late.sleepinessTarget > day.sleepinessTarget);
  assert.ok(day.activity > late.activity);
});

test('dayKey：同日同键、跨日不同键', () => {
  assert.equal(dayKey(new Date(2026, 8, 28)), '2026-09-28');
  assert.notEqual(dayKey(new Date(2026, 8, 28)), dayKey(new Date(2026, 8, 29)));
});
