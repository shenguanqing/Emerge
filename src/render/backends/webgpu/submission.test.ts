import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebGPUBackend } from './WebGPUBackend';
import { createLifeState, DEFAULT_LIFE_PARAMS, DEFAULT_SIMULATION_PARAMS } from '../../../core/types';
import { HOLOGRAM_GLSL, HOLOGRAM_SIGNAL_GLSL, HOLOGRAM_WGSL, HOLOGRAM_SIGNAL_WGSL, ATTENTION_SIGNAL_WGSL } from '../../HologramField';

test('路径显现随成长连续单调，核心先可见、晚期端口不会提前成形', () => {
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const helpers: Record<string, (...args: number[]) => number> = {
    hash1: (v) => { const x = Math.sin(v) * 43758.5453123; return x - Math.floor(x); },
    floor: Math.floor, pow: Math.pow, clamp,
    smoothstep: (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
  };
  for (const name of ['neuralIdentity', 'orbitIdentity', 'orbitCapacity', 'hologramReadiness']) {
    const header = HOLOGRAM_GLSL.match(new RegExp(`float ${name}\\(([^)]*)\\) \\{`));
    assert.ok(header);
    const start = header.index! + header[0].length;
    let end = start;
    let depth = 1;
    while (depth && end < HOLOGRAM_GLSL.length) {
      const ch = HOLOGRAM_GLSL[end++];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    const args = header[1].split(',').map((arg) => arg.trim().replace(/^float /, ''));
    const body = HOLOGRAM_GLSL.slice(start, end - 1).replace(/float (\w+) =/g, 'let $1 =');
    const fn = new Function(...args, ...Object.keys(helpers), body);
    const values = Object.values(helpers);
    helpers[name] = (...inputs) => fn(...inputs, ...values);
  }
  const ready = helpers.hologramReadiness;
  for (let i = 0; i < 200; i++) {
    const seed = (i + 0.5) / 200;
    let previous = ready(seed, 0);
    for (let j = 1; j <= 1000; j++) {
      const value = ready(seed, j / 1000);
      assert.ok(value >= 0 && value <= 1 && value >= previous);
      // 最快的是末期环丝容量：27 × 1.6 × smoothstep 最大斜率 1.5。
      assert.ok(value - previous < 0.07, '增长不能让细丝突然出现');
      previous = value;
    }
    assert.equal(previous, 1);
  }
  assert.equal(ready(0.03, 0), 1);
  assert.equal(ready(0.1, 0.45), 1);
  assert.equal(ready(0.87, 0.45), 0);
});

// 执行共享源中的标量公式，不另写一套旋转/轨道实现。
function scalarField(name: string): (...values: number[]) => number {
  const match = HOLOGRAM_GLSL.match(new RegExp(`float ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `找不到共享公式 ${name}`);
  const args = match[1].split(',').map((arg) => arg.trim().replace(/^float /, ''));
  const body = match[2].replace(/\bfloat (\w+) =/g, 'let $1 =');
  const evaluate = new Function(...args, 'floor', 'min', 'fract', 'sin', 'hash1', body);
  const fract = (v: number) => v - Math.floor(v);
  const hash1 = (v: number) => fract(Math.sin(v) * 43758.5453123);
  return (...values) => evaluate(...values, Math.floor, Math.min, fract, Math.sin, hash1);
}

test('数据弧末端错开，但成长不改变相位，各丝共用同一流动速度', () => {
  const longitude = scalarField('orbitLongitude');
  for (const along of [0.1, 0.42, 0.81]) {
    for (let lane = 0; lane < 18; lane++) {
      const reference = longitude(lane, along, 123.4, 1);
      assert.equal(longitude(lane, along, 123.4, 0.45), reference);
      assert.ok(Math.abs(longitude(lane, along, 43200.1, 1) - longitude(lane, along, 43200, 1) - 0.031) < 1e-9);
      assert.ok(Math.abs(reference - longitude(0, along, 123.4, 1)) < 0.14);
    }
  }
});

test('所有环丝合并后仍留下宏观空间断口，不被末端错位填成整圈', () => {
  const longitude = scalarField('orbitLongitude');
  const angles: number[] = [];
  const tau = 2 * Math.PI;
  for (let lane = 0; lane < 18; lane++) {
    for (let i = 0; i < 600; i++) angles.push((longitude(lane, (i + 0.5) / 600, 0, 1) + tau) % tau);
  }
  angles.sort((a, b) => a - b);
  const gaps = angles.map((angle, i) => (i + 1 < angles.length ? angles[i + 1] : angles[0] + tau) - angle);
  assert.equal(gaps.filter((gap) => gap > 0.35).length, 3, '三段不等长主环之间各有真实断口');
  assert.ok(Math.max(...gaps) > 0.50, '至少一处大断口不被其他环丝覆盖');
  assert.ok(gaps.filter((gap) => gap > 0.35).reduce((sum, gap) => sum + gap, 0) > 1.4);
});

test('球层自转连续，局部滞后有界，长时运行保持约 26 秒一圈', () => {
  const longitude = scalarField('nodeLongitude');
  for (let node = 0; node < 24; node++) {
    for (const t of [0, 1, 43200]) {
      const speed = (longitude(node, t + 0.1) - longitude(node, t)) / 0.1;
      const period = 2 * Math.PI / speed;
      assert.ok(period >= 25 && period <= 27);
      assert.ok(Math.abs(speed - 0.24) <= 0.00326);
    }
    assert.ok(Math.abs(longitude(node, 43200) - longitude(node, 0) - 43200 * 0.24) <= 0.050001);
  }
});

test('共享组织场转换不遗留 GLSL 条件表达式、双参数 atan 或 WGSL 保留字', () => {
  const shader = HOLOGRAM_WGSL + HOLOGRAM_SIGNAL_WGSL + ATTENTION_SIGNAL_WGSL;
  assert.doesNotMatch(shader, /\?/);
  assert.doesNotMatch(shader, /\batan\([^)]*,/);
  assert.doesNotMatch(shader, /\bvar\s+(type|class|enum|typedef)\s*:/);
  const functions = [...shader.matchAll(/\bfn\s+(\w+)\(/g)].map((match) => match[1]);
  assert.equal(new Set(functions).size, functions.length, '模拟与绘制共用模块中不重复声明拓扑函数');
  assert.ok(functions.includes('hologramThread'));
});

test('GPU 未完成时不积压帧，完成后恢复，队列失败后停止提交', async () => {
  let finish!: () => void;
  let fail!: (reason: Error) => void;
  let submissions = 0;
  let writes = 0;
  const pass = { setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {} };
  // 只模拟 GPU 队列，不申请设备、不编译着色器、不绘制。
  const backend = Object.assign(Object.create(WebGPUBackend.prototype), {
    disposed: false, failed: false, framePending: false,
    simData: new Float32Array(64), renderData: new Float32Array(48),
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


test('光学分层在相机前后连续、透射有界，后层软化而非消失', () => {
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const shared = (name: string) => {
    const match = HOLOGRAM_SIGNAL_GLSL.match(new RegExp(`float ${name}\\(float depth\\) \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match);
    const fn = new Function('depth', 'smoothstep', 'mix', match[1].replace(/float (\w+) =/g, 'const $1 ='));
    return (depth: number): number => fn(depth, smoothstep, (a: number, b: number, t: number) => a + (b - a) * t);
  };
  const transmission = shared('hologramTransmission');
  const focus = shared('hologramFocus');
  let previous = transmission(-1);
  for (let i = 0; i <= 200; i++) {
    const depth = -1 + i / 100;
    const value = transmission(depth);
    assert.ok(value >= 0.29 && value <= 1.33);
    assert.ok(value >= previous && value - previous < 0.02);
    assert.ok(focus(depth) >= 1 && focus(depth) <= 1.33);
    previous = value;
  }
  assert.ok(transmission(1) > transmission(-1) * 3);
  assert.ok(focus(-1) > focus(1));
});


test('共享场不改写 WGSL 不可变函数参数，避免编译失败后静默回退', () => {
  const source = HOLOGRAM_WGSL + HOLOGRAM_SIGNAL_WGSL + ATTENTION_SIGNAL_WGSL;
  for (const match of source.matchAll(/fn \w+\(([^)]*)\)[^{]*\{/g)) {
    let end = match.index! + match[0].length;
    const start = end;
    let depth = 1;
    while (depth && end < source.length) {
      const ch = source[end++];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    const body = source.slice(start, end - 1);
    for (const arg of match[1].split(',')) {
      const name = arg.trim().split(':')[0];
      if (name) assert.doesNotMatch(body, new RegExp(`\\b${name}\\s*(?:[+*/-]=|=(?!=))`), `不可改写参数 ${name}`);
    }
  }
});

test('外伸端口保留 Body 刚度，CPU 初始层级与共享 GPU 场一致', async () => {
  const { createParticleInitData } = await import('../particleInit');
  const source = HOLOGRAM_GLSL.match(/float hologramLayer\(float seed\) \{([\s\S]*?)\n\}/);
  assert.ok(source);
  const layer = new Function('seed', source[1]) as (seed: number) => number;
  assert.equal(layer(0.04), 0);
  assert.equal(layer(0.85), 1, '端口属于身体，不能作为松散尘点');
  assert.equal(layer(0.98), 2);
  const data = createParticleInitData(4096);
  for (let i = 0; i < 4096; i++) {
    assert.equal(layer(data.positions[i * 4 + 3]), data.velocities[i * 4 + 3]);
  }
});

test('不同电路笔画的覆盖补偿有限且有界，核心不随线宽补偿增亮', () => {
  const fract = (v: number) => v - Math.floor(v);
  const helpers: Record<string, (...args: number[]) => number> = {
    hash1: (v) => fract(Math.sin(v) * 43758.5453123),
    floor: Math.floor, abs: Math.abs,
    step: (a, b) => b < a ? 0 : 1,
    mix: (a, b, t) => a + (b - a) * t,
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
  };
  for (const name of ['hologramLineScale', 'hologramAspect', 'hologramCoverage']) {
    const match = HOLOGRAM_SIGNAL_GLSL.match(new RegExp(`float ${name}\\(float seed\\) \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match);
    const fn = new Function('seed', ...Object.keys(helpers), match[1].replace(/float (\w+) =/g, 'const $1 ='));
    const values = Object.values(helpers);
    helpers[name] = (seed) => fn(seed, ...values);
  }
  for (let i = 0; i <= 1000; i++) {
    const seed = i / 1000;
    const coverage = helpers.hologramCoverage(seed);
    assert.ok(Number.isFinite(coverage) && coverage >= 0.65 && coverage <= 2.2);
    assert.ok(helpers.hologramLineScale(seed) > 0);
    assert.ok(helpers.hologramAspect(seed) >= 1);
    if (seed < 0.07) assert.equal(coverage, 1);
  }
});
