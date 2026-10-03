import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebGPUBackend } from './WebGPUBackend';
import { createLifeState, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS } from '../../../core/types';

test('GPU 未完成时不积压帧，完成后恢复，队列失败后停止提交', async () => {
  let finish!: () => void;
  let fail!: (reason: Error) => void;
  let submissions = 0;
  let writes = 0;
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {} };
  // 只模拟 GPU 队列，不申请设备、不编译着色器、不绘制。
  const backend = Object.assign(Object.create(WebGPUBackend.prototype), {
    disposed: false, failed: false, framePending: false,
    simData: new Float32Array(64), renderData: new Float32Array(44),
    sim: DEFAULT_SIMULATION_PARAMS, params: DEFAULT_LIFE_PARAMS,
    particleCount: 100, readIdx: 0, computeBinds: [{}, {}], renderBinds: [{}, {}],
    context: { getCurrentTexture: () => ({ createView: () => ({}) }) },
    device: {
      queue: {
        writeBuffer() { writes++; },
        submit() { submissions++; },
        onSubmittedWorkDone: () => new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }),
      },
      createCommandEncoder: () => ({ beginComputePass: () => pass, beginRenderPass: () => pass, finish: () => ({}) }),
    },
  }) as WebGPUBackend;
  const state = createLifeState();
  backend.frame(state, 1 / 60);
  for (let i = 0; i < 120; i++) backend.frame(state, 1 / 60);
  assert.equal(submissions, 1);
  assert.equal(writes, 2);
  finish();
  await Promise.resolve();
  backend.frame(state, 1 / 60);
  assert.equal(submissions, 2);
  fail(new Error('simulated device loss'));
  await Promise.resolve();
  backend.frame(state, 1 / 60);
  assert.equal(submissions, 2);
  assert.equal(writes, 4);
});
