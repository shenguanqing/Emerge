// 核心逻辑测试：确定性随机、持久化往返、成长单调、昼夜相位。
// 运行：pnpm test:core
import test from 'node:test';
import { LifeEngine } from './LifeEngine';
import { createLifeState, DEFAULT_LIFE_PARAMS } from './types';
import assert from 'node:assert/strict';

import { generateDNAFromSeed, mulberry32 } from './DNAEngine';
import { MemoryEngine, createMemoryState, dayKey } from './MemoryEngine';
import { FORM_ORBIT_LANES, GrowthEngine, formStage, formStructure, type FormStructure } from './GrowthEngine';
import {
  MemoryStorage,
  loadLife,
  saveLife,
  clearLife,
  STORAGE_KEY,
  SCHEMA_VERSION,
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
    schemaVersion: SCHEMA_VERSION,
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
  const g = new GrowthEngine({ days: 1, interactionMinutes: 0, growthBias: 0.5, tailProbability: 0.5 });
  let prev = g.state.growth;
  for (let m = 30; m <= 600; m += 30) {
    g.update({ days: 1 + m / 120, interactionMinutes: m, growthBias: 0.5, tailProbability: 0.5 });
    assert.ok(g.state.growth >= prev);
    prev = g.state.growth;
  }
  assert.ok(g.state.growth <= 1);
  assert.equal(typeof g.state.stage, 'string');
});

test('四形态：阶段阈值与结构复杂度单调递增', () => {
  assert.equal(formStage(0.2), 'origin');
  assert.equal(formStage(0.45), 'awaken');
  assert.equal(formStage(0.7), 'conscious');
  assert.equal(formStage(0.95), 'emerge');

  const o = formStructure(0.2);
  const a = formStructure(0.45);
  const c = formStructure(0.7);
  const e = formStructure(1.0);
  // 同一母体：轨道/神经/碎片/弧流随成长变复杂，Origin 最简。
  assert.ok(o.orbitCount < a.orbitCount && a.orbitCount < c.orbitCount && c.orbitCount < e.orbitCount);
  assert.ok(o.orbitCount <= 6);
  assert.ok(a.orbitCount >= 5 && a.orbitCount <= 12);
  assert.ok(c.orbitCount >= 17 && c.orbitCount <= 19);
  assert.equal(e.orbitCount, FORM_ORBIT_LANES);
  assert.ok(o.neural > 0 && o.neural < 0.1);
  assert.ok(o.neural < a.neural && a.neural < c.neural && c.neural < e.neural);
  assert.ok(c.neural > 0.5 && e.neural > 0.9);
  // 弯曲脉络：Awaken 起出现，Conscious 最密，Emerge 部分让位给环轨。
  assert.equal(o.spoke, 0);
  assert.ok(a.spoke > 0.5 && c.spoke > 0.9);
  assert.ok(e.spoke > 0.2 && e.spoke < c.spoke);
  assert.equal(o.streamArc, 0);
  assert.ok(e.streamArc > 0.5);
  assert.ok(o.coreGlow < e.coreGlow);
  // 轨道永不封口。
  assert.ok(formStructure(1.0).orbitBroken > 0.7);
});

test('四形态：阶段边界保留存档语义，结构连续且参数有界', () => {
  const continuousKeys = Object.keys(formStructure(0)).filter((key) => key !== 'orbitCount') as (keyof FormStructure)[];
  for (const [threshold, before, after] of [
    [0.3, 'origin', 'awaken'],
    [0.55, 'awaken', 'conscious'],
    [0.85, 'conscious', 'emerge'],
  ] as const) {
    assert.equal(formStage(threshold - 1e-5), before);
    assert.equal(formStage(threshold), after);
    const left = formStructure(threshold - 1e-5);
    const right = formStructure(threshold + 1e-5);
    for (const key of continuousKeys) assert.ok(Math.abs(right[key] - left[key]) < 0.001, `${threshold}: ${key}`);
    assert.ok(Math.abs(right.orbitCount - left.orbitCount) <= 1);
  }
  assert.deepEqual(formStructure(-1), formStructure(0));
  assert.deepEqual(formStructure(2), formStructure(1));
  let previous = formStructure(0);
  for (let i = 0; i <= 100; i++) {
    const form = formStructure(i / 100);
    for (const key of continuousKeys) assert.ok(Number.isFinite(form[key]) && form[key] >= 0 && form[key] <= 1, key);
    assert.ok(Number.isInteger(form.orbitCount) && form.orbitCount >= 3 && form.orbitCount <= FORM_ORBIT_LANES);
    assert.ok(form.orbitCount >= previous.orbitCount);
    assert.ok(form.neural >= previous.neural);
    assert.ok(form.orbitBroken > 0.7);
    previous = form;
  }
});

test('四形态：DNA 尾迹不改变成长阶段和轨道条数，初始结构独立且一致', () => {
  for (const growthFloor of [0, 0.2, 0.45, 0.7, 0.95, 1]) {
    const common = { days: 1, interactionMinutes: 0, growthBias: 0.5, growthFloor };
    const shortTail = new GrowthEngine({ ...common, tailProbability: 0 }).state;
    const longTail = new GrowthEngine({ ...common, tailProbability: 1 }).state;
    assert.equal(shortTail.growth, longTail.growth);
    assert.equal(shortTail.stage, longTail.stage);
    assert.equal(shortTail.form.orbitCount, longTail.form.orbitCount);
    assert.ok(shortTail.form.streamArc <= longTail.form.streamArc);
    if (growthFloor > 0.85) assert.ok(shortTail.form.streamArc < longTail.form.streamArc);
  }
  const first = createLifeState(), second = createLifeState();
  assert.deepEqual(first.form, formStructure(0));
  assert.equal(first.form.orbitCount, 3);
  first.form.orbitCount = FORM_ORBIT_LANES;
  assert.equal(second.form.orbitCount, 3);
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


test('音乐：低频驱动呼吸，停止监听后节拍脉冲自然衰减', () => {
  const engine = new LifeEngine({ ...DEFAULT_LIFE_PARAMS });
  engine.setMusic({ active: true, bass: 0.8, mid: 0.3, treble: 0.2, energy: 0.5, beat: true });
  engine.update(1 / 60);
  assert.equal(engine.getState().musicActive, 1);
  assert.equal(engine.getState().musicBass, 0.8);
  assert.ok(engine.getState().pulseBoost > 0.9);
  engine.setMusic({ active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false });
  for (let i = 0; i < 60; i++) engine.update(1 / 60);
  assert.equal(engine.getState().musicActive, 0);
  assert.ok(engine.getState().pulseBoost < 0.1);
});


test('驱散：声音开启时远处高速鼠标不惊散，近处仍响应，离开后恢复', () => {
  const make = () => {
    const engine = new LifeEngine({ ...DEFAULT_LIFE_PARAMS });
    engine.setPositionLocked(true);
    engine.setMusic({ active: true, bass: 0.5, mid: 0.3, treble: 0.2, energy: 0.4, beat: false });
    return engine;
  };
  const far = make();
  const near = make();
  const inactive = make();
  for (let i = 0; i < 60; i++) {
    far.setPointer({ active: true, world: [20, 0, 0], worldVel: [20, 0, 0] });
    near.setPointer({ active: true, world: [1, 0, 0], worldVel: [20, 0, 0] });
    inactive.setPointer({ active: false, world: [1, 0, 0], worldVel: [20, 0, 0] });
    for (const engine of [far, near, inactive]) engine.update(1 / 60);
  }
  assert.equal(far.getState().scatter, 0);
  assert.equal(inactive.getState().scatter, 0);
  assert.ok(near.getState().scatter > 0.5);
  // 即使残留高速读数，指针离开作用范围后也只能衰减。
  near.setPointer({ active: true, world: [20, 0, 0], worldVel: [20, 0, 0] });
  for (let i = 0; i < 240; i++) near.update(1 / 60);
  assert.ok(near.getState().scatter < 0.03);
  assert.equal(near.getState().musicActive, 1);
});


import { QualityManager, qualityAppearance } from './QualityManager';
test('画质：连续两次降档保持理论点覆盖面积', () => {
  for (const growth of [0, 0.5, 1]) {
    const reference = qualityAppearance('high', growth);
    for (const tier of ['medium', 'low', 'ultra'] as const) {
      const current = qualityAppearance(tier, growth);
      assert.ok(Math.abs(current.count * current.pointSize ** 2
        - reference.count * reference.pointSize ** 2) < 0.001);
    }
  }
});
test('画质：零散低帧率不能跨闲置累积成降档', () => {
  const quality = new QualityManager();
  for (let i = 0; i < 40; i++) {
    quality.sample(30, 0, 0.5);
    quality.sample(30, 30, 0.5);
  }
  assert.equal(quality.tier, 'high');
  for (let i = 0; i < 10; i++) quality.sample(30, 0, 0.5);
  assert.equal(quality.tier, 'medium');
});

test('桌面停留点：锁定后声音与远处指针不改变核心位置', () => {
  const engine = new LifeEngine({ ...DEFAULT_LIFE_PARAMS });
  engine.setHome([4, -2, 0]);
  engine.setPositionLocked(true);
  engine.setMusic({ active: true, bass: 1, mid: 1, treble: 1, energy: 1, beat: true });
  engine.setPointer({ active: true, world: [-4, 2, 0], worldVel: [20, 0, 0] });
  for (let i = 0; i < 300; i++) engine.update(1 / 60);
  assert.deepEqual(engine.getState().corePosition, [4, -2, 0]);
});

import { desktopPosition, normalizePosition } from './settings';
test('桌面摆放：比例坐标映射、窗口缩放与损坏位置防护', () => {
  assert.deepEqual(desktopPosition(0.5, 0.5, 1440, 900), [0, 0, 0]);
  const corner = desktopPosition(0.88, 0.84, 1440, 900);
  assert.ok(corner[0] > 0 && corner[1] < 0);
  assert.deepEqual(desktopPosition(0.88, 0.84, 2880, 1800), corner);
  assert.equal(normalizePosition(NaN, 0.88), 0.88);
  assert.equal(normalizePosition(-1), 0.05);
  assert.equal(normalizePosition(2), 0.95);
});


test('三路成长：静音、短音效、隐藏不算音乐，音量不影响计分', () => {
  const quiet = new MemoryEngine(createMemoryState(new Date(2026, 8, 30)));
  const loud = new MemoryEngine(createMemoryState(new Date(2026, 8, 30)));
  const tick = { dt: 1, active: false, pointerSpeed: 0, shock: 0, night: false, musicActive: true };
  quiet.tick({ ...tick, musicEnergy: 0 });
  quiet.tick({ ...tick, musicEnergy: 0.1 });
  quiet.tick({ ...tick, musicEnergy: 0 });
  assert.equal(quiet.state.musicMinutes, 0);
  for (let i = 0; i < 62; i++) {
    quiet.tick({ ...tick, musicEnergy: 0.1 });
    loud.tick({ ...tick, musicEnergy: 1 });
  }
  assert.ok(Math.abs(quiet.state.musicMinutes - 1) < 1e-9);
  assert.equal(quiet.state.musicCredit, loud.state.musicCredit);
  const before = JSON.stringify(quiet.state);
  quiet.tick({ ...tick, visible: false, musicEnergy: 1, active: true, pointerSpeed: 0.5 });
  assert.equal(JSON.stringify(quiet.state), before);
});

test('音乐额度：跨 30 分钟连续递减，保存重启和日期回拨不重置', () => {
  const date = new Date(2026, 8, 30, 12);
  const memory = new MemoryEngine(createMemoryState(date));
  const tick = { dt: 60, realDt: 60, active: false, pointerSpeed: 0, shock: 0, night: false,
    musicActive: true, musicEnergy: 0.5, date };
  for (let i = 0; i < 60; i++) memory.tick(tick);
  assert.ok(memory.state.musicCredit > 30 && memory.state.musicCredit < 40);
  const storage = new MemoryStorage();
  memory.state.growthFloor = 0.6;
  saveLife(storage, { schemaVersion: SCHEMA_VERSION, dna: generateDNAFromSeed(0.1, date.getTime()),
    memory: memory.state, lastActiveTime: date.getTime() });
  const loaded = loadLife(storage);
  assert.ok(loaded.ok);
  const resumed = new MemoryEngine(loaded.snapshot.memory);
  assert.deepEqual(resumed.state, memory.state);
  const previous = resumed.state.musicCredit;
  resumed.tick({ ...tick, date: new Date(2026, 8, 29, 12) });
  assert.ok(resumed.state.musicCredit - previous < 0.4);
  assert.equal(resumed.state.daily.day, dayKey(date));
  resumed.tick({ ...tick, date: new Date(2026, 9, 1, 12) });
  assert.equal(resumed.state.daily.day, '2026-10-01');
  assert.equal(resumed.state.daily.musicMinutes, 1);
});

test('最慢 DNA 仅靠陪伴也能成熟，各条路径均增加成长且永久下限不回退', () => {
  const common = { days: 1, interactionMinutes: 0, growthBias: 0, tailProbability: 0.5 };
  assert.equal(new GrowthEngine({ ...common, companionMinutes: 4000 }).state.growth, 1);
  assert.ok(new GrowthEngine({ ...common, musicMinutes: 30 }).state.growth > 0);
  assert.ok(new GrowthEngine({ ...common, interactionMinutes: 20 }).state.growth > 0);
  assert.equal(new GrowthEngine({ ...common, growthFloor: 0.9 }).state.growth, 0.9);
});

test('旧存档迁移保留身份和至少旧成长值，新字段有效，损坏额度被拒绝', () => {
  const storage = new MemoryStorage();
  const dna = generateDNAFromSeed(0.5, 1700000000000);
  const legacy = { schemaVersion: 1, daysSeen: ['2026-09-29'], totalMinutes: 200,
    interactionMinutes: 120, gentleMinutes: 60, scareCount: 0, nightMinutes: 0, lastVisitDay: '2026-09-29' };
  storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, dna, memory: legacy, lastActiveTime: 1700000000000 }));
  const result = loadLife(storage);
  assert.ok(result.ok);
  assert.equal(result.snapshot.schemaVersion, 2);
  assert.deepEqual(result.snapshot.dna, dna);
  const m = new MemoryEngine(result.snapshot.memory);
  assert.equal(m.state.musicMinutes, 0);
  assert.ok(new GrowthEngine({ ...m.growthInputs, growthBias: dna.growthBias, tailProbability: dna.tailProbability }).state.growth
    >= 0.3 * (0.7 + 0.6 * dna.growthBias));
  result.snapshot.memory.musicCredit = -1;
  saveLife(storage, result.snapshot);
  assert.equal(loadLife(storage).ok, false);
});

test('真实互动：停留不挂机计分，远处移动不计分，附近温和移动可成长', () => {
  const dna = generateDNAFromSeed(0.5, Date.now());
  const memory = new MemoryEngine(createMemoryState(new Date()));
  const growth = new GrowthEngine({ ...memory.growthInputs, growthBias: dna.growthBias, tailProbability: dna.tailProbability });
  const engine = new LifeEngine({ ...DEFAULT_LIFE_PARAMS }, { dna, memory, growth });
  engine.setPositionLocked(true);
  engine.setInteractionScale(0.2);
  const advance = () => { for (let i = 0; i < 600; i++) engine.update(1 / 60); };
  engine.setPointer({ active: true, world: [0.1, 0, 0], worldVel: [0, 0, 0] });
  advance();
  assert.equal(memory.state.interactionMinutes, 0);
  engine.setPointer({ active: true, world: [10, 0, 0], worldVel: [0.5, 0, 0] });
  advance();
  assert.equal(memory.state.interactionMinutes, 0);
  // 20% 团大小的新外缘：0.5 已超出旧感知半径，放大后仍应计入温和互动。
  engine.setPointer({ active: true, world: [0.5, 0, 0], worldVel: [0.5, 0, 0] });
  advance();
  assert.ok(memory.state.interactionMinutes > 0.1);
  engine.setPointer({ active: true, world: [0.1, 0, 0], worldVel: [0, 0, 0] });
  advance(); // 最近一次互动允许短暂停留回应，然后停止计分。
  const before = memory.state.interactionMinutes;
  advance();
  assert.equal(memory.state.interactionMinutes, before);
});


import { FramePacer } from './FramePacer';
test('帧调度：抖动帧间隔不丢累计余量，暂停不追赶', () => {
  const pacer = new FramePacer();
  let frames = 0;
  for (let i = 0; i < 600; i++) if (pacer.step(i % 2 ? 0.020 : 0.013333333, 30) !== null) frames++;
  assert.ok(frames >= 299 && frames <= 301, `实际提交 ${frames}`);
  assert.equal(pacer.step(60, 60), null);
  assert.equal(pacer.step(0.001, 60), null);
  pacer.reset();
  assert.equal(pacer.step(0.001, 30), null);
});
test('长期负载：成熟不阻止降档，音乐闲置不降至 15fps', () => {
  const q = new QualityManager();
  for (let i = 0; i < 80; i++) q.sample(10, 120, 0.5, 1, true);
  assert.equal(q.targetFps, 30);
  assert.equal(q.tier, 'low');
  q.sample(30, 120, 0.5, 1, false);
  assert.equal(q.targetFps, 15);
  q.sample(30, 0, 0.5, 1, false);
  assert.equal(q.targetFps, 60);
});

import { cssToWorldOnViewPlane, DEFAULT_CAMERA } from '../render/ViewState';
test('指针投影：默认相机中心落在原点，边缘与旧公式一致', () => {
  const cam = { ...DEFAULT_CAMERA };
  const center = cssToWorldOnViewPlane(cam, 640, 360, 1280, 720);
  assert.ok(Math.abs(center[0]) < 1e-9 && Math.abs(center[1]) < 1e-9 && Math.abs(center[2]) < 1e-9, `中心 ${center}`);
  // fov 50°、距离 7 的 z=0 平面：右缘 x = tan(25°)*7*aspect
  const halfH = Math.tan((50 * Math.PI) / 180 / 2) * 7;
  const halfW = halfH * (1280 / 720);
  const right = cssToWorldOnViewPlane(cam, 1280, 360, 1280, 720);
  assert.ok(Math.abs(right[0] - halfW) < 1e-6, `右缘 x=${right[0]} 期望 ${halfW}`);
  assert.ok(Math.abs(right[1]) < 1e-6 && Math.abs(right[2]) < 1e-6);
  // 旋转相机后中心仍映射到 target（默认原点）
  const orbited = cssToWorldOnViewPlane({ azimuth: 0.9, elevation: 0.4, distance: 5, target: [0, 0, 0] }, 640, 360, 1280, 720);
  assert.ok(Math.hypot(...orbited) < 1e-6, `旋转中心 ${orbited}`);
  // 桌面摆位（非原点）时，屏幕中心映射到 target 而非原点
  const home = cssToWorldOnViewPlane(
    { azimuth: 0.2, elevation: 0.1, distance: 5.4, target: [2.4, -1.8, 0] },
    640, 360, 1280, 720,
  );
  assert.ok(Math.hypot(home[0] - 2.4, home[1] + 1.8, home[2]) < 1e-6, `摆位中心 ${home}`);
});
