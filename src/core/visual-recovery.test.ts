import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyHitRadius, createLifeState, DEFAULT_SIMULATION_PARAMS } from './types';
import { formStructure } from './GrowthEngine';

test('合入已确认预览的尺度后命中范围与其一致', () => {
  assert.equal(DEFAULT_SIMULATION_PARAMS.bodyBase, 1.28);
  for (const scale of [0.1, 0.4, 1]) {
    for (const breath of [0.92, 1, 1.08]) {
      for (const wpp of [0.005, 0.01, 0.02]) {
        assert.equal(bodyHitRadius(scale, breath, wpp, 44), Math.max(1.6 * 1.28 * scale * breath / wpp, 44));
      }
    }
  }
});

test('初始形态与成长映射一致，各生命体不共享可变形态对象', () => {
  const first = createLifeState();
  const second = createLifeState();
  assert.deepEqual(first.form, formStructure(0));
  first.form.orbitCount = 999;
  assert.deepEqual(second.form, formStructure(0));
});
