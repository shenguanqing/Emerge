/**
 * 智体的粒子组织场：同一偏心核逐步长出弧片、邻接神经链与回流。
 * 共享数学源生成 GLSL/WGSL；所有返回值仅为弹簧力目标，不直接改粒子位置。
 */
import { FORM_NODE_COUNT, FORM_ORBIT_LANES } from '../core/GrowthEngine';

const NODE_COUNT = `${FORM_NODE_COUNT}.0`;
const ORBIT_LANES = `${FORM_ORBIT_LANES}.0`;

/** 限定为本文件使用的标量/向量函数子集，两种后端消费同一表达式。 */
function toWGSL(source: string): string {
  return source
    .replace(/\b(float|vec3) (\w+)\(([^)]*)\)\s*\{/g, (_, type: string, name: string, args: string) =>
      `fn ${name}(${args.replace(/float (\w+)/g, '$1: f32')}) -> ${type === 'float' ? 'f32' : 'vec3f'} {`)
    .replace(/\b(float|vec3) (\w+) =/g, (_, type: string, name: string) =>
      `var ${name}: ${type === 'float' ? 'f32' : 'vec3f'} =`)
    .replace(/\bvec3\(/g, 'vec3f(');
}

// 拓扑身份与传播相位也供绘制阶段使用，信号必须对应真正的节点/路径。
const TOPOLOGY_GLSL = `
float neuralIdentity(float seed) {
  return floor(hash1(seed * 19.7 + 0.4) * ${NODE_COUNT});
}
float orbitIdentity(float seed) {
  return floor(hash1(seed * 73.1 + 0.71) * ${ORBIT_LANES});
}
float orbitCapacity(float growth) {
  return 3.0 + ${FORM_ORBIT_LANES - 3}.0 * pow(clamp(growth, 0.0, 1.0), 1.6);
}
float pathwayPosition(float seed) {
  return hash1(seed * 13.7);
}
`;

export const HOLOGRAM_GLSL = TOPOLOGY_GLSL + `
vec3 neuralNode(float seed, float time, float growth) {
  float angle = seed * 2.3999632 + time * 0.014;
  float z = 1.0 - 2.0 * (seed + 0.5) / ${NODE_COUNT};
  float xy = sqrt(max(0.0, 1.0 - z * z));
  float radius = 0.68 + 0.20 * hash1(seed * 3.1);
  vec3 q = vec3(cos(angle) * xy, sin(angle) * xy * 0.98, z * 1.03) * radius;
  q += vec3(sin(seed * 1.7 + time * 0.09), cos(seed * 2.1 - time * 0.07), sin(time * 0.11 + seed)) * 0.035;
  return q;
}

vec3 looseAnchor(float seed, float time, float growth) {
  // 少量卷曲感知流带；四阶段共用这些组织方向，成熟后仍保留零星游离尘。
  float strand = floor(hash1(seed * 157.7) * 3.0);
  float u = hash1(seed * 149.1);
  float angle = strand * 2.25 + u * (4.2 + hash1(strand * 11.7)) + time * (0.025 + strand * 0.008);
  float radius = 0.22 + u * (0.83 + hash1(strand * 19.7) * 0.23);
  float tilt = 0.35 + strand * 0.72;
  vec3 q = vec3(cos(angle), sin(angle) * cos(tilt) * 0.8, sin(angle) * sin(tilt)) * radius;
  q.y += sin(u * 6.0 + strand + time * 0.10) * 0.12 * u;
  vec3 dust = vec3(hash1(seed * 23.7), hash1(seed * 29.1), hash1(seed * 31.3)) * 2.0 - 1.0;
  // 幼体也保留弥散的立体细胞簇，避免所有粒子挤成三条空心卷带。
  float node = floor(hash1(seed * 181.3) * 8.0) * 3.0;
  vec3 cell = neuralNode(node, time * 0.6, growth) * (0.68 + u * 0.32) + dust * 0.12;
  float volume = smoothstep(0.68, 0.72, hash1(seed * 167.3));
  return mix(q + dust * (0.025 + u * 0.09), cell, volume);
}

vec3 orbitAnchor(float seed, float time, float growth) {
  float lane = orbitIdentity(seed);
  // 邻近六条弧共用组织面，形成分区弧片；避免几十条任意轨道穿心搅成雾。
  float sector = floor(lane / 6.0);
  float sublane = lane - sector * 6.0;
  float local = hash1(seed * 37.7 + 0.13);
  float shard = floor(local * 3.0);
  float along = fract(local * 3.0);
  // 每个组织面保留三段空间连续的大缺口，片内还有微小数据间隙。
  along = (floor(along * 36.0) + min(fract(along * 36.0), 0.75)) / 36.0;
  float direction = 1.0;
  if (hash1(sector * 31.7) < 0.5) { direction = -1.0; }
  float angle = hash1(sector * 17.3) * 6.2831853 + shard * 2.0943951 + (along - 0.5) * (1.30 + growth * 0.52)
              + time * (0.025 + sector * 0.009) * direction;
  float radius = 0.84 + hash1(sector * 29.1) * 0.035 + sublane * 0.035;
  radius *= 1.0 + 0.035 * cos(angle + sector) + 0.022 * sin(angle * 3.0 - time * 0.13);
  float tilt = 0.38 + sector * 0.53 + sublane * 0.018;
  float heading = sector * 2.3999632 + time * 0.008;
  vec3 q = vec3(cos(angle), sin(angle) * cos(tilt), sin(angle) * sin(tilt)) * radius;
  float width = (hash1(seed * 91.31) - 0.5) * (0.025 - growth * 0.014);
  q.z += width;
  q = vec3(q.x * cos(heading) + q.z * sin(heading), q.y, -q.x * sin(heading) + q.z * cos(heading));
  q += vec3(cos(sector * 2.1), sin(sector * 1.3), sin(sector * 2.7)) * 0.025;
  // 约四分之一轨道粒子形成侧向微纤维与伴随尘，为弧片补厚度而不另画实体。
  float detail = smoothstep(0.74, 0.78, hash1(seed * 127.1));
  vec3 fiber = vec3(hash1(seed * 131.7), hash1(seed * 137.3), hash1(seed * 139.1)) * 2.0 - 1.0;
  q += fiber * detail * (0.015 + 0.018 * growth);
  float activation = smoothstep(lane, lane + 1.0, orbitCapacity(growth));
  return mix(looseAnchor(seed, time, growth), q, activation);
}

vec3 structuredAnchor(float seed, float time, float growth, float arcStrength) {
  float g = clamp(growth, 0.0, 1.0);
  float neural = smoothstep(0.10, 0.78, g);
  float spoke = smoothstep(0.20, 0.50, g) * (1.0 - 0.55 * smoothstep(0.78, 1.00, g));
  float membrane = smoothstep(0.18, 0.55, g);
  float fragment = smoothstep(0.50, 0.90, g);
  float streamArc = clamp(arcStrength, 0.0, 1.0);
  if (seed < 0.07) {
    // 偏心组织核：内部有暗隙的粒子叶瓣，不用白球掩盖结构。
    float angle = hash1(seed * 5.17) * 6.2831853 + time * 0.045;
    float z = hash1(seed * 7.31) * 2.0 - 1.0;
    float xy = sqrt(max(0.0, 1.0 - z * z));
    float radius = 0.08 + pow(hash1(seed * 11.3), 0.65) * 0.12;
    radius *= 1.0 + 0.18 * sin(angle * 3.0 + z * 2.0 - time * 0.12);
    return vec3(cos(angle) * xy, sin(angle) * xy * 0.80, z) * radius;
  }
  if (seed < 0.16) {
    float strand = floor(hash1(seed * 9.3) * 3.0);
    float vortex = 0.22 + 0.78 * smoothstep(0.12, 0.55, g);
    float angle = hash1(seed * 37.7 + 5.1) * 6.2831853 + time * (0.03 + vortex * 0.065 + strand * 0.018);
    float radius = 0.22 + hash1(seed * 3.71) * 0.32;
    float tilt = 0.4 + strand * 0.85;
    vec3 q = vec3(cos(angle), sin(angle) * cos(tilt), sin(angle) * sin(tilt)) * radius;
    // 内旋涡保持纵向厚度，不能在小半径压成三条过亮的蠕虫状细弧。
    return q + (vec3(hash1(seed * 7.1), hash1(seed * 11.7), hash1(seed * 17.1)) * 2.0 - 1.0) * 0.065;
  }
  if (seed < 0.34) {
    float node = neuralIdentity(seed);
    vec3 start = neuralNode(node, time, g);
    float along = pathwayPosition(seed);
    float connectAt = 0.08 + hash1(node * 3.7) * 0.32;
    float connection = smoothstep(connectAt, connectAt + 0.12, g);
    if (hash1(seed * 41.3) < 0.70) {
      // Fibonacci 球面中相邻方向以 +5/+8 配对；曲线沿外层绕核，不画穿核弦。
      float offset = 5.0;
      if (hash1(node * 7.1) > 0.5) { offset = 8.0; }
      float next = fract((node + offset) / ${NODE_COUNT}) * ${NODE_COUNT};
      vec3 end = neuralNode(next, time, g);
      vec3 curve = mix(start, end, along);
      curve += vec3(sin(node * 1.7), cos(node * 1.3), 0.5) * sin(along * 3.1415927) * 0.12;
      curve = normalize(curve + vec3(0.00001)) * mix(length(start), length(end), along);
      return mix(looseAnchor(seed, time, g), curve, connection);
    }
    vec3 jitter = vec3(hash1(seed * 97.3), hash1(seed * 101.7), hash1(seed * 109.1)) * 2.0 - 1.0;
    return mix(looseAnchor(seed, time, g), start + jitter * 0.034, connection);
  }
  if (seed < 0.58) { return orbitAnchor(seed, time, g); }
  if (seed < 0.66) {
    // 同预算中保留 8% 粒子组成厚的内部组织束，填实核心与外层之间。
    float cell = floor(hash1(seed * 173.1) * 12.0);
    float along = pathwayPosition(seed);
    vec3 axis = neuralNode(cell * 2.0, time * 0.8, g);
    vec3 side = normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(0.00001, 0.0, 0.0));
    vec3 up = normalize(cross(axis, side));
    float turn = hash1(seed * 179.3) * 6.2831853 + time * (0.018 + cell * 0.002);
    float thickness = 0.035 + sqrt(along) * 0.09;
    vec3 q = axis * (0.16 + sqrt(along) * 0.78);
    q += side * sin(along * 5.0 + cell * 1.7 + time * 0.06) * 0.08;
    q += (side * cos(turn) + up * sin(turn)) * thickness;
    vec3 grain = vec3(hash1(seed * 191.7), hash1(seed * 193.3), hash1(seed * 197.1)) * 2.0 - 1.0;
    q += grain * 0.026;
    // 初生也有紧实的芽核，成长后再展开为内部多层组织，不等待成熟才填充。
    return q * (0.58 + 0.42 * g);
  }
  if (seed < 0.74) {
    float node = neuralIdentity(seed);
    float along = pathwayPosition(seed);
    vec3 end = neuralNode(node, time, g) * 1.10;
    vec3 side = normalize(cross(end, vec3(0.0, 1.0, 0.0)) + vec3(0.00001, 0.0, 0.0));
    vec3 start = normalize(end + side * 0.9) * 0.24;
    vec3 q = mix(start, end, along) + side * sin(along * 3.1415927) * 0.20;
    q += vec3(hash1(seed * 7.7), hash1(seed * 9.1), hash1(seed * 11.3)) * 0.014;
    return mix(looseAnchor(seed, time, g), q, smoothstep(0.20, 0.50, g));
  }
  if (seed < 0.84) {
    // 膜族一半以上编成断续经向微脉络，补充参考图的纵向组织和层间连接。
    float fiberSector = floor(hash1(seed * 23.1) * 12.0);
    float along = pathwayPosition(seed);
    if (hash1(seed * 151.7) < 0.55) {
      float latitude = -1.18 + floor(along * 3.0) * 0.90 + fract(along * 3.0) * 0.63;
      float longitude = fiberSector * 0.5235988 + time * 0.014
                      + 0.14 * sin(latitude * 2.0 + fiberSector * 1.7 + time * 0.07);
      float radius = 0.86 + hash1(fiberSector * 11.1) * 0.20;
      radius += sin(latitude * 3.0 + fiberSector) * 0.035;
      vec3 filament = vec3(cos(longitude) * cos(latitude), sin(latitude), sin(longitude) * cos(latitude)) * radius;
      vec3 grain = vec3(hash1(seed * 7.1), hash1(seed * 11.7), hash1(seed * 17.1)) * 2.0 - 1.0;
      filament += grain * 0.015;
      return mix(looseAnchor(seed, time, g), filament, membrane);
    }
    // 剩余孔隙点云填充层间体积，整体近球形但保留共同暗缝。
    float sector = floor(hash1(seed * 23.1) * 8.0);
    float angle = sector * 2.3999632 + (hash1(seed * 29.7) - 0.5) * 1.10 + time * 0.014;
    float z = clamp(1.0 - 2.0 * (sector + 0.5) / 8.0 + (hash1(seed * 31.7) - 0.5) * 0.40, -0.98, 0.98);
    float xy = sqrt(max(0.0, 1.0 - z * z));
    float radius = 0.54 + pow(hash1(seed * 47.3), 0.45) * 0.52;
    radius *= 1.0 + 0.05 * sin(angle * 3.0 + time * 0.11 + sector);
    vec3 panel = vec3(cos(angle) * xy, sin(angle) * xy, z) * radius;
    // 细粒子在同一分区内微旋，膜面与内部微脉络都有厚度。
    panel += vec3(sin(angle * 7.0 + z * 9.0), cos(angle * 5.0 - z * 7.0), sin(angle * 6.0)) * 0.022;
    return mix(looseAnchor(seed, time, g), panel, membrane);
  }
  if (seed < 0.90) {
    // 少量节点簇向外独立活动，保留碎片身份，不覆盖成回流/短弧。
    float group = floor(hash1(seed * 61.3) * 6.0);
    vec3 center = neuralNode(group * 4.0, time * 0.8, g);
    center *= 1.24 + fragment * (0.22 + 0.14 * sin(time * 0.17 + group * 2.1));
    vec3 dust = vec3(hash1(seed * 67.1), hash1(seed * 71.9), hash1(seed * 77.1)) * 2.0 - 1.0;
    return mix(looseAnchor(seed, time, g), center + dust * 0.08, fragment);
  }
  // 连续的出核→绕外层→回核曲线；路径稳定，传播靠局部光包而非目标瞬间复位。
  float stream = floor(hash1(seed * 83.1) * 4.0);
  float along = pathwayPosition(seed);
  float angle = stream * 2.3999632 + along * 5.4 + time * (0.018 + stream * 0.007);
  float radius = 0.24 + sin(along * 3.1415927) * (0.75 + streamArc * 0.65);
  float tilt = 0.42 + stream * 0.65;
  vec3 q = vec3(cos(angle), sin(angle) * cos(tilt), sin(angle) * sin(tilt)) * radius;
  q.y += sin(along * 6.2831853) * 0.18;
  return mix(looseAnchor(seed, time, g), q, streamArc);
}

vec3 hologramAnchor(float seed, float time, float growth, float arcStrength) {
  float g = clamp(growth, 0.0, 1.0);
  vec3 structure = structuredAnchor(seed, time, g, arcStrength);
  vec3 cloud = looseAnchor(seed, time, g);
  // 粒子簇先后组织，而非所有粒子长期停在流带与骨架中间糊成云。
  float assembleAt = hash1(floor(seed * 47.0) * 3.17 + 0.4) * 0.42;
  float cohesion = smoothstep(assembleAt, assembleAt + 0.10, g);
  if (seed < 0.16) { cohesion = 1.0; }
  if (seed >= 0.58 && seed < 0.66) { cohesion = 0.72 + smoothstep(0.08, 0.40, g) * 0.28; }
  // 分区只短暂松脱少量粒子，主要神经骨架保持可读。
  float sector = floor(hash1(seed * 73.1 + 0.71) * 12.0);
  float activity = sin(time * 0.37 + sector * 2.1) * sin(time * 0.173 + sector * 0.73);
  float release = smoothstep(0.64, 0.95, activity) * (0.025 + 0.04 * g);
  vec3 q = mix(cloud, structure, cohesion * (1.0 - release));
  vec3 drift = vec3(sin(q.y * 3.2 + time * 0.43), sin(q.z * 4.1 - time * 0.31), cos(q.x * 3.7 + time * 0.29));
  q += drift * (0.010 + 0.018 * (1.0 - g));
  float breath = sin(time * 0.81 + q.y * 2.4) + 0.45 * sin(time * 0.33 + q.x * 3.1);
  q *= 1.0 + breath * 0.018;
  // 四阶段共用偏心轴与轻微椭圆包络，成长不会突然换成另一种球。
  q.x *= 1.03;
  q.y *= 1.06;
  return q + vec3(-0.07, 0.04, 0.02);
}
`;
export const HOLOGRAM_WGSL = toWGSL(HOLOGRAM_GLSL);

export const HOLOGRAM_SIGNAL_GLSL = TOPOLOGY_GLSL + `
float pathwayPacket(float route, float along, float time) {
  float front = fract(time * (0.10 + hash1(route * 7.1) * 0.045) - route * 0.137);
  return 1.0 - smoothstep(0.025, 0.13, abs(along - front));
}
float hologramExposure(float seed, float growth) {
  float neural = smoothstep(0.10, 0.78, growth);
  if (seed >= 0.16 && seed < 0.34) { return 0.55 + neural * 0.45; }
  if (seed >= 0.34 && seed < 0.58) {
    float activation = smoothstep(orbitIdentity(seed), orbitIdentity(seed) + 1.0, orbitCapacity(growth));
    return mix(0.30, 1.55, activation);
  }
  if (seed >= 0.58 && seed < 0.66) { return 1.10; }
  if (seed >= 0.74 && seed < 0.84) { return 0.32 + smoothstep(0.18, 0.55, growth) * 0.26; }
  if (seed >= 0.84 && seed < 0.90) { return 0.60; }
  if (seed >= 0.90) { return 0.32 + smoothstep(0.72, 0.98, growth) * 0.78; }
  return 1.0;
}
float hologramSignal(float seed, float time, float growth) {
  // 身体的常态保持暗底；亮包沿实际脉络、轨道或回流推进。
  float route = neuralIdentity(seed);
  float along = pathwayPosition(seed);
  if (seed >= 0.34 && seed < 0.58) {
    route = orbitIdentity(seed);
    along = hash1(seed * 37.7 + 0.13);
  }
  if (seed >= 0.58 && seed < 0.66) { route = floor(hash1(seed * 173.1) * 12.0); }
  if (seed >= 0.74 && seed < 0.84) { route = floor(hash1(seed * 23.1) * 12.0); }
  if (seed >= 0.90) { route = floor(hash1(seed * 83.1) * 4.0); }
  float packet = pathwayPacket(route, along, time);
  if (seed >= 0.16 && seed < 0.34 && hash1(seed * 41.3) >= 0.70) {
    // 节点簇在自身路径的起点，也接收实际前驱路径的到达信号。
    float previous5 = fract((route + ${NODE_COUNT} - 5.0) / ${NODE_COUNT}) * ${NODE_COUNT};
    float previous8 = fract((route + ${NODE_COUNT} - 8.0) / ${NODE_COUNT}) * ${NODE_COUNT};
    packet = pathwayPacket(route, 0.0, time);
    if (hash1(previous5 * 7.1) <= 0.5) { packet = max(packet, pathwayPacket(previous5, 1.0, time)); }
    if (hash1(previous8 * 7.1) > 0.5) { packet = max(packet, pathwayPacket(previous8, 1.0, time)); }
  }
  float organized = 0.12 + 0.88 * smoothstep(0.10, 0.78, growth);
  if (seed < 0.07) { return 1.30 + growth * 0.18 + 0.10 * sin(time * 0.7 + along * 4.0); }
  if (seed >= 0.58 && seed < 0.66) { return 1.0 + packet * organized * 0.65; }
  return 0.88 + packet * organized * 1.20;
}
`;
// WebGPU 的计算与绘制入口在同一 shader module，拓扑函数已由 HOLOGRAM_WGSL 注入。
export const HOLOGRAM_SIGNAL_WGSL = toWGSL(HOLOGRAM_SIGNAL_GLSL.slice(TOPOLOGY_GLSL.length));

/** 注意逐步聚焦一片组织，感知信号传入核后再沿路径回应。 */
export const ATTENTION_SIGNAL_GLSL = `
float attentionSignal(float seed, float phase, float focus, float attention, float pulse, float growth) {
  float node = neuralIdentity(seed);
  float angle = node * 2.3999632;
  float scan = pow(0.5 + 0.5 * cos(angle - focus), 5.0);
  float along = pathwayPosition(seed);
  float front = fract(phase - node * 0.037);
  float incoming = 1.0 - smoothstep(0.04, 0.22, abs(along - (1.0 - front)));
  float outgoing = 1.0 - smoothstep(0.04, 0.18, abs(along - front));
  float organized = 0.18 + 0.82 * smoothstep(0.10, 0.78, growth);
  if (seed < 0.07) { return 0.90 + pulse * 0.16; }
  float path = smoothstep(0.14, 0.18, seed) * (1.0 - smoothstep(0.32, 0.36, seed));
  path += smoothstep(0.64, 0.68, seed) * (1.0 - smoothstep(0.72, 0.76, seed));
  return 0.90 + path * organized * (scan * attention * (0.25 + incoming * 1.10) + outgoing * pulse * 0.85);
}
`;
export const ATTENTION_SIGNAL_WGSL = toWGSL(ATTENTION_SIGNAL_GLSL);
