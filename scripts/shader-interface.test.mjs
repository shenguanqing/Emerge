import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('WebGL2 顶点/片元共同使用的 uniform 精度一致', () => {
  const source = readFileSync(resolve(root, 'src/render/backends/webgl2/WebGL2Backend.ts'), 'utf8');
  const stage = (name) => {
    const text = source.split(`const ${name} = /* glsl */ \``)[1].split('`;')[0];
    // Three.js 在两阶段都注入设备支持的同一默认精度。
    const defaultPrecision = [...text.matchAll(/precision\s+(\w+)\s+float\s*;/g)].at(-1)?.[1] ?? 'three-default';
    return new Map([...text.matchAll(/uniform\s+(?:(lowp|mediump|highp)\s+)?(?:float|vec[234])\s+(\w+)\s*;/g)]
      .filter(([, , name]) => [...text.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length > 1)
      .map(([, precision, name]) => [name, precision ?? defaultPrecision]));
  };
  const vertex = stage('POINTS_VERT');
  const fragment = stage('POINTS_FRAG');
  assert.ok(vertex.has('uGrowth'));
  assert.equal(fragment.has('uGrowth'), false, '已撤回最后一轮片元核心高亮');
  assert.equal(source.includes('vNucleus'), false, '不残留最后一轮核心插值量');
  for (const [name, precision] of vertex) {
    if (fragment.has(name)) assert.equal(fragment.get(name), precision, `${name} 跨阶段精度不匹配`);
  }
});
