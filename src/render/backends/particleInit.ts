/**
 * 粒子初始数据（CPU 生成一次，上传 GPU）。
 * 布局 RGBA：position.xyz + seed；velocity.xyz + layer(0 核心 / 1 身体 / 2 外围)。
 * 两个模拟后端（WebGPU / WebGL2）使用同一份初始数据语义。
 */
export interface ParticleInitData {
  positions: Float32Array;
  velocities: Float32Array;
}

export function createParticleInitData(count: number): ParticleInitData {
  const positions = new Float32Array(count * 4);
  const velocities = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    // 随机方向 + 立方根体积分布（初始松散，启动后由锚点弹簧自然收拢）。
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = Math.cbrt(Math.random()) * 3.5;
    positions[i * 4] = Math.cos(theta) * s * r;
    positions[i * 4 + 1] = Math.sin(theta) * s * r;
    positions[i * 4 + 2] = u * r;
    positions[i * 4 + 3] = Math.random();

    // 层级配比：12% 核心、74% 身体、14% 外围（Phase 3 起影响密度与力权重）。
    const roll = Math.random();
    const layer = roll < 0.12 ? 0 : roll < 0.86 ? 1 : 2;
    velocities[i * 4] = 0;
    velocities[i * 4 + 1] = 0;
    velocities[i * 4 + 2] = 0;
    velocities[i * 4 + 3] = layer;
  }
  return { positions, velocities };
}
