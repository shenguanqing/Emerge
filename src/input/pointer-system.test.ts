import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerSystem } from './PointerSystem';

test('切换观察空间时清空重复双击、按压及待放行点击', () => {
  const pointer = new PointerSystem();
  pointer.setViewport(800, 600);
  pointer.press(400, 300, true);
  pointer.release();
  pointer.press(400, 300, true);
  assert.equal(pointer.isPressing(), true);
  pointer.clearGestures();
  assert.equal(pointer.isPressing(), false);
  assert.equal(pointer.consumeDoubleClick(), null);
  assert.equal(pointer.consumeClick(), null);
});

test('模式切换后新的双击仍可识别，单击不会借用上一个模式的点击', () => {
  const pointer = new PointerSystem();
  pointer.setViewport(800, 600);
  pointer.press(400, 300, true);
  pointer.release();
  pointer.clearGestures();
  pointer.press(400, 300, true);
  assert.equal(pointer.consumeDoubleClick(), null);
  pointer.release();
  pointer.press(400, 300, true);
  assert.deepEqual(pointer.consumeDoubleClick(), { x: 400, y: 300 });
});
