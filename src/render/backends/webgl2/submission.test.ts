import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('顶点/片元着色器只引用已声明的 uniform（Pass 10 花屏回归）', () => {
  // 单元测试不编译 GLSL；未声明标识曾导致桌面 WebGL2 直接花屏，此测试堵住该类别。
  const src = readFileSync('src/render/backends/webgl2/WebGL2Backend.ts', 'utf8');
  for (const name of ['POINTS_VERT', 'POINTS_FRAG']) {
    const match = src.match(new RegExp(`const ${name} = /\\* glsl \\*/ \`([\\s\\S]*?)\`;`));
    assert.ok(match, `${name} 源码块存在`);
    const declared = new Set(
      [...match[1].matchAll(/uniform\s+(?:float|int|vec2|vec3|vec4|sampler2D)\s+(\w+)\s*(?:\[.+?\])?\s*;/g)]
        .map((m) => m[1]),
    );
    for (const use of match[1].matchAll(/\bu[A-Z]\w*/g)) {
      assert.ok(declared.has(use[0]), `${name}: ${use[0]} 未声明`);
    }
  }
});
