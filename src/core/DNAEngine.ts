/**
 * DNA 引擎：每个生命体创建时生成一组永久参数。
 * 同一 seed 确定性生成同一份 DNA——这是「每个用户的生命体都不一样」的根基。
 * core 模块纯 TypeScript，不依赖渲染器、Vue 或 DOM。
 */

export interface LifeDNA {
  version: 1;
  /** Life ID，如 PL-7F92-A31C。 */
  id: string;
  /** 主随机种子 0..1（决定形体扰动相位等）。 */
  seed: number;
  /** 运动风格：0 漂移 / 1 环游 / 2 游走。 */
  movementStyle: number;
  /** 形体对称度 0..1（越高轮廓越平滑）。 */
  symmetry: number;
  /** 粒子密度乘 0.8..1.2。 */
  particleDensity: number;
  /** 核心数：1 或 2（2 需成长解锁）。 */
  coreCount: number;
  /** 尾迹倾向 0..1。 */
  tailProbability: number;
  /** 流场频率。 */
  noiseFrequency: number;
  /** 流场强度乘 0.7..1.3。 */
  noiseStrength: number;
  curiosityBase: number;
  fearBase: number;
  energyBase: number;
  /** 成长速度倾向 0..1。 */
  growthBias: number;
  /** 旋涡倾向 0..1。 */
  orbitBias: number;
  /** 流场倾向 0..1。 */
  flowBias: number;
  /** 生日（epoch 毫秒）。 */
  bornAt: number;
}

/** 确定性伪随机：同一种子产生同一序列（x0 ∈ (0,1)）。 */
export function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 0xffffffff) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (rng: () => number, min: number, max: number): number =>
  min + rng() * (max - min);

const pick = (rng: () => number, min: number, max: number): number =>
  Math.floor(range(rng, min, max + 0.999));

function makeId(rng: () => number): string {
  const hex = (n: number) =>
    Math.floor(rng() * 16 ** n)
      .toString(16)
      .toUpperCase()
      .padStart(n, '0');
  return `PL-${hex(4)}-${hex(4)}`;
}

/** 由种子生成 DNA（确定性）。 */
export function generateDNAFromSeed(seed: number, bornAt: number): LifeDNA {
  const rng = mulberry32(seed);
  return {
    version: 1,
    id: makeId(rng),
    seed,
    movementStyle: pick(rng, 0, 2),
    symmetry: range(rng, 0.15, 0.9),
    particleDensity: range(rng, 0.8, 1.2),
    coreCount: 1,
    tailProbability: range(rng, 0.2, 0.9),
    noiseFrequency: range(rng, 0.35, 0.8),
    noiseStrength: range(rng, 0.7, 1.3),
    curiosityBase: range(rng, 0.25, 0.55),
    fearBase: range(rng, 0.25, 0.6),
    energyBase: range(rng, 0.3, 0.6),
    growthBias: range(rng, 0.2, 0.9),
    orbitBias: range(rng, 0.2, 0.9),
    flowBias: range(rng, 0.2, 0.9),
    bornAt,
  };
}

/** 创建新生命（随机种子）。 */
export function generateDNA(bornAt: number): LifeDNA {
  const random = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(random);
  } else {
    random[0] = Math.floor(Math.random() * 0xffffffff);
  }
  return generateDNAFromSeed(random[0] / 0x100000000, bornAt);
}

// 延迟导入类型避免循环依赖：仅类型引用。
import type { LifeParams, SimulationParams } from './types';

/** 把 DNA 映射到引擎参数（原地修改）。DNA 创建后永不改变，映射保持稳定。 */
export function applyDNA(dna: LifeDNA, params: LifeParams, sim: SimulationParams): void {
  params.energyBase = dna.energyBase;
  params.curiosityBase = dna.curiosityBase;
  params.trustBase = Math.min(Math.max(0.4 - dna.fearBase * 0.3, 0.15), 0.6);
  sim.curlFrequency = dna.noiseFrequency;
  sim.curlStrength = 0.85 * dna.noiseStrength;
  sim.swirlBase = 2.6 * (0.7 + 0.6 * dna.orbitBias);
  sim.curlSpeed = 0.06 * (0.8 + 0.5 * dna.flowBias);
  sim.pressStrength = 2.6;
  void dna.particleDensity; // 粒子密度在档位分配时使用（后续阶段接线）
  void dna.movementStyle;   // 运动风格在成长/行为扩展时使用
  void dna.tailProbability; // 尾迹强度在成长可视化时使用
}
