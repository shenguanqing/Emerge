import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CAMERA, dragCamera, placedCamera, worldToCssOnViewPlane, type Vec3 } from '../render/ViewState';

test('任意摆位绕主体旋转后保持投影位置和尺寸，俯仰角受限', () => {
  for (const core of [[0, 0, 0], [2, -1, 0], [-2, 1, 0.3]] as Vec3[]) {
    const expected = worldToCssOnViewPlane(DEFAULT_CAMERA, core, 1200, 800);
    for (const dy of [-900, 80, 900]) {
      const cam = placedCamera(dragCamera(DEFAULT_CAMERA, 400, dy), core);
      const actual = worldToCssOnViewPlane(cam, core, 1200, 800);
      assert.ok(Math.abs(actual.x - expected.x) < 0.001);
      assert.ok(Math.abs(actual.y - expected.y) < 0.001);
      assert.ok(Math.abs(actual.worldPerPx - expected.worldPerPx) < 0.00001);
      assert.ok(Math.abs(cam.elevation) <= 1.2);
    }
  }
});
