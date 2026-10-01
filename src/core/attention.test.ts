import test from 'node:test';
import assert from 'node:assert/strict';
import { AttentionEngine } from './AttentionEngine';

test('注意节律：同 DNA 种子和输入可重现，闲置会组织与停顿', () => {
  const a = new AttentionEngine(0.37), b = new AttentionEngine(0.37);
  let slow = false, moving = false;
  for (let i = 0; i < 2400; i++) {
    a.update(0.05, 0, 0, 0, 0); b.update(0.05, 0, 0, 0, 0);
    assert.deepEqual(a.state, b.state);
    slow ||= a.state.contemplation > 0.8;
    moving ||= i > 40 && a.state.contemplation < 0.1;
    for (const key of ['attention', 'thoughtPhase', 'thoughtPulse', 'contemplation'] as const) {
      assert.ok(a.state[key] >= 0 && a.state[key] <= 1, key);
    }
  }
  assert.ok(slow && moving);
  assert.ok(a.state.structureTime > 0 && a.state.structureTime < 120);
});

test('注意节律：靠近产生注意，受惊抑制注意，停止推进不跳变', () => {
  const engine = new AttentionEngine(0.37);
  for (let i = 0; i < 80; i++) engine.update(0.05, 1, Math.PI / 2, 0, 0);
  assert.ok(engine.state.attention > 0.9);
  assert.ok(Math.abs(engine.state.focusAngle - Math.PI / 2) < 0.1);
  for (let i = 0; i < 80; i++) engine.update(0.05, 1, Math.PI / 2, 1, 0);
  assert.ok(engine.state.attention < 0.01);
  const before = { ...engine.state };
  engine.update(0, 1, 0, 0, 0);
  assert.deepEqual(engine.state, before);
});
