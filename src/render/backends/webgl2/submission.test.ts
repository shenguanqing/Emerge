import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebGL2Backend } from './WebGL2Backend';
import { createLifeState } from '../../../core/types';

test('WebGL 队列未完成时跳过帧，等待失败后不继续提交', () => {
  let status = 1;
  let waits = 0;
  let deleted = 0;
  const gl = {
    TIMEOUT_EXPIRED: 1, WAIT_FAILED: 2,
    isContextLost: () => false,
    clientWaitSync(_sync: unknown, flags: number, timeout: number) {
      assert.equal(flags, 0); assert.equal(timeout, 0); waits++; return status;
    },
    deleteSync() { deleted++; },
  };
  // 未提供模拟/绘制资源；若防护失效访问这些资源，测试会失败。
  const backend = Object.assign(Object.create(WebGL2Backend.prototype), {
    disposed: false, gpuFailed: false, pendingFence: {},
    renderer: { getContext: () => gl },
  }) as WebGL2Backend;
  for (let i = 0; i < 120; i++) backend.frame(createLifeState(), 1 / 30);
  assert.equal(waits, 120); assert.equal(deleted, 0);
  status = 2;
  backend.frame(createLifeState(), 1 / 30);
  backend.frame(createLifeState(), 1 / 30);
  assert.equal(waits, 121); assert.equal(deleted, 1);
});

test('WebGL 上下文丢失立即停止', () => {
  const backend = Object.assign(Object.create(WebGL2Backend.prototype), {
    renderer: { getContext: () => ({ isContextLost: () => true }) },
  }) as WebGL2Backend;
  backend.frame(createLifeState(), 1 / 30);
});
