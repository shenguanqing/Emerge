import test from 'node:test';
import assert from 'node:assert/strict';
import { BehaviorEngine } from './BehaviorEngine';
import { createEmotionState } from './EmotionEngine';
test('受惊增强排斥，平静后连续恢复，高信任允许靠近', () => {
  const behavior = new BehaviorEngine();
  const emotion = createEmotionState(0.5, 0.5, 0);
  const pointer = { active: true, world: [1, 0, 0] as [number, number, number], worldVel: [0, 0, 0] as [number, number, number] };
  const tick = () => behavior.update(1 / 60, emotion, pointer, [0, 0, 0], 1);
  emotion.stress = 1;
  let output = tick();
  for (let i = 0; i < 180; i++) output = tick();
  assert.ok(output.pointerPushMul > 1.45 && output.pointerPushMul <= 1.5);
  assert.ok(output.coreTarget[0] < 0, '核心向指针反方向退避');
  const frightened = output.pointerPushMul;
  emotion.stress = 0;
  output = tick();
  assert.ok(output.pointerPushMul < frightened && output.pointerPushMul > frightened - 0.05, '恢复不能跳变');
  for (let i = 0; i < 600; i++) output = tick();
  assert.ok(Math.abs(output.pointerPushMul - 1) < 0.001);
  emotion.trust = 1;
  emotion.curiosity = 1;
  for (let i = 0; i < 600; i++) output = tick();
  assert.ok(output.pointerPushMul >= 0.55 && output.pointerPushMul < 0.6);
});

function idlePointer() {
  return { active: false, world: [9, 0, 0] as [number, number, number], worldVel: [0, 0, 0] as [number, number, number] };
}

function nearPointer() {
  return { active: true, world: [1, 0, 0] as [number, number, number], worldVel: [0, 0, 0] as [number, number, number] };
}

test('探索：无指针高活跃时出现、有指针时退去、漫游扩大且连续', () => {
  const behavior = new BehaviorEngine();
  const emotion = createEmotionState(0.5, 0, 0);
  emotion.activity = 0.8;
  const tick = (active: boolean) => behavior.update(
    1 / 60, emotion, active ? nearPointer() : idlePointer(), [2, 0, 0], 1, { arousal: 0, sleepiness: 0 });
  let output = tick(false);
  for (let i = 0; i < 600; i++) output = tick(false);
  assert.ok(output.explore > 0.8, '无指针高活跃应进入探索');
  assert.ok(output.calm < 0.7, '平静应给探索让位');
  const roaming = Math.abs(output.coreTarget[0]);
  assert.ok(roaming > 1.2, '探索漫游幅度应明显大于漂移基线');
  const before = output.explore;
  output = tick(true);
  assert.ok(output.explore < before, '有指针后探索开始消退');
  for (let i = 0; i < 600; i++) output = tick(true);
  assert.ok(output.explore < 0.05, '有指针时探索应退去');
});

test('兴奋：高能量/新刺激时出现、趋近更快、消退连续', () => {
  const fresh = () => {
    const behavior = new BehaviorEngine();
    const emotion = createEmotionState(0.5, 0.5, 0);
    emotion.curiosity = 1;
    return { behavior, emotion };
  };
  const a = fresh();
  a.emotion.energy = 1;
  let outA = a.behavior.update(1 / 60, a.emotion, nearPointer(), [0, 0, 0], 1, { arousal: 1, sleepiness: 0 });
  for (let i = 0; i < 300; i++) {
    outA = a.behavior.update(1 / 60, a.emotion, nearPointer(), [0, 0, 0], 1, { arousal: 1, sleepiness: 0 });
  }
  assert.ok(outA.excited > 0.8, '高能量+刺激应进入兴奋');
  const b = fresh();
  b.emotion.energy = 0.3;
  let outB = b.behavior.update(1 / 60, b.emotion, nearPointer(), [0, 0, 0], 1, { arousal: 0, sleepiness: 0 });
  for (let i = 0; i < 300; i++) {
    outB = b.behavior.update(1 / 60, b.emotion, nearPointer(), [0, 0, 0], 1, { arousal: 0, sleepiness: 0 });
  }
  assert.ok(outA.coreTarget[0] > outB.coreTarget[0], '兴奋时核心趋近指针更快');
  a.emotion.energy = 0.3;
  const before = outA.excited;
  outA = a.behavior.update(1 / 60, a.emotion, nearPointer(), [0, 0, 0], 1, { arousal: 0, sleepiness: 0 });
  assert.ok(outA.excited < before && outA.excited > before - 0.05, '兴奋消退不能跳变');
});

test('困倦：随睡眠倾向出现、漫游收敛、趋近被抑制', () => {
  const behavior = new BehaviorEngine();
  const emotion = createEmotionState(0.5, 0.5, 0);
  emotion.activity = 0.8;
  emotion.curiosity = 1;
  const tick = (sleepiness: number) => behavior.update(
    1 / 60, emotion, nearPointer(), [2, 0, 0], 1, { arousal: 0, sleepiness });
  let output = tick(0);
  for (let i = 0; i < 300; i++) output = tick(0);
  const awake = Math.abs(output.coreTarget[0]);
  output = tick(1);
  for (let i = 0; i < 600; i++) output = tick(1);
  assert.ok(output.sleepy > 0.8, '高睡眠倾向应进入困倦');
  assert.ok(Math.abs(output.coreTarget[0]) < awake * 0.5, '困倦时漫游应收敛');
  assert.ok(output.calm < 0.5, '困倦不是平静');
});

test('嬉戏：信任+温和互动时出现、响应更快、困倦抑制', () => {
  const behavior = new BehaviorEngine();
  const emotion = createEmotionState(0.5, 0, 1);
  emotion.curiosity = 1;
  const tick = (sleepiness: number) => behavior.update(
    1 / 60, emotion, nearPointer(), [0, 0, 0], 1, { arousal: 0, sleepiness });
  let output = tick(0);
  for (let i = 0; i < 600; i++) output = tick(0);
  assert.ok(output.playful > 0.8, '信任+温和互动应进入嬉戏');
  assert.ok(output.coreTarget[0] > 0.3, '嬉戏时核心应积极趋近');
  output = tick(1);
  for (let i = 0; i < 600; i++) output = tick(1);
  assert.ok(output.playful < 0.1, '困倦应抑制嬉戏');
});

test('孤独：长时间无互动出现、有指针即清零、困倦抑制', () => {
  const behavior = new BehaviorEngine();
  behavior.lonelyStartSec = 2;
  behavior.lonelyFullSec = 5;
  const emotion = createEmotionState(0.5, 0, 0);
  const tick = (active: boolean, sleepiness: number) => behavior.update(
    1 / 60, emotion, active ? nearPointer() : idlePointer(), [0, 0, 0], 1, { arousal: 0, sleepiness });
  let output = tick(false, 0);
  for (let i = 0; i < 600; i++) output = tick(false, 0);
  assert.ok(output.lonely > 0.8, '长时间无互动应进入孤独');
  const peak = output.lonely;
  output = tick(true, 0);
  assert.ok(output.lonely < peak && output.lonely > peak - 0.05, '有指针后孤独开始消退且不跳变');
  for (let i = 0; i < 600; i++) output = tick(true, 0);
  assert.ok(output.lonely < 0.05, '有互动时孤独应退去');
  for (let i = 0; i < 400; i++) output = tick(false, 1);
  assert.ok(output.lonely < 0.1, '困倦应抑制孤独');
});

test('五态权重始终有界，零步长不产生 NaN', () => {
  const behavior = new BehaviorEngine();
  const emotion = createEmotionState(0.9, 0.9, 0.9);
  emotion.activity = 1;
  emotion.stress = 0.5;
  const out = behavior.update(1 / 60, emotion, nearPointer(), [3, -2, 1], 1, { arousal: 1, sleepiness: 0.7 });
  for (const v of [out.calm, out.curious, out.scared, out.explore, out.excited, out.sleepy, out.playful, out.lonely, out.contract]) {
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, '权重有界');
  }
  assert.ok(Number.isFinite(out.pointerPushMul) && out.pointerPushMul >= 0.55 && out.pointerPushMul <= 1.5);
  assert.ok(out.coreTarget.every(Number.isFinite), '核心目标有限');
  const frozen = behavior.update(0, emotion, nearPointer(), [3, -2, 1], 1, { arousal: 1, sleepiness: 0.7 });
  assert.ok(frozen.coreTarget.every(Number.isFinite), '零步长不产生 NaN');
});
