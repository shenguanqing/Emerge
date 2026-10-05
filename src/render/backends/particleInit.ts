/**
 * 粒子初始数据（CPU 生成一次，上传 GPU）。
 * 布局 RGBA：position.xyz + seed；velocity.xyz + layer。
 * 层级由 seed 确定性导出（seed<0.07 核心 / <0.96 身体与端口 / 其余外缘数据流），
 * 与两侧 shader 的推导保持一致，避免额外存储。
 */
export interface ParticleInitData {
  positions: Float32Array;
  velocities: Float32Array;
}

export function createParticleInitData(count: number): ParticleInitData {
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    // 随机方向 + 立方根体积分布（初始松散，凝聚期由旋涡力收拢）。
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = Math.cbrt(Math.random()) * 5.0;
    positions[i * 4] = Math.cos(theta) * s * r;
    positions[i * 4 + 1] = Math.sin(theta) * s * r;
    positions[i * 4 + 2] = u * r;
    // 分类也使用实际上传的 f32 种子，避免边界舍入后 CPU/GPU 层级不一致。
    const seed = Math.fround(Math.random());
    positions[i * 4 + 3] = seed;

    const layer = seed < 0.07 ? 0 : seed < 0.96 ? 1 : 2;
    velocities[i * 4] = 0;
    velocities[i * 4 + 1] = 0;
    velocities[i * 4 + 2] = 0;
    velocities[i * 4 + 3] = layer;
  }
  return { positions, velocities };
}