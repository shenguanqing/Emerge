import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityManager } from './QualityManager';

test('桌面稳定 30 FPS 不误判为性能不足而放大光点', () => {
  const quality = new QualityManager(30);
  for (let i = 0; i < 120; i++) quality.sample(30, 0, 0.5, 1);
  assert.equal(quality.targetFps, 30);
  assert.ok(quality.tier === 'high' || quality.tier === 'ultra');
});

test('桌面低于实际帧率目标会降档，休眠恢复仍遵守 30 FPS', () => {
  const quality = new QualityManager(30);
  for (let i = 0; i < 60; i++) quality.sample(15, 0, 0.5, 1);
  assert.equal(quality.tier, 'low');
  quality.sample(15, 61, 0.5, 1);
  assert.equal(quality.targetFps, 15);
  quality.sample(30, 0, 0.5, 1);
  assert.equal(quality.targetFps, 30);
  assert.equal(new QualityManager().targetFps, 60);
});
