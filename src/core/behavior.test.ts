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
