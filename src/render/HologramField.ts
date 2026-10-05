/**
 * 粒子智体的空间组织：中央环腔 → 横向传输束与三维径向支路 → 球面电路及断续数据弧。
 * GLSL/WGSL 同源；锚点仅作为弹簧力目标，路径与信号共用拓扑身份。
 */
import { FORM_NODE_COUNT, FORM_ORBIT_LANES } from '../core/GrowthEngine';

const NODE_COUNT = `${FORM_NODE_COUNT}.0`;
const ORBIT_LANES = `${FORM_ORBIT_LANES}.0`;

function toWGSL(source: string): string {
  return source
    .replace(/\b(float|vec3) (\w+)\(([^)]*)\)\s*\{/g, (_, type: string, name: string, args: string) =>
      `fn ${name}(${args.replace(/float (\w+)/g, '$1: f32')}) -> ${type === 'float' ? 'f32' : 'vec3f'} {`)
    .replace(/\b(float|vec3) (\w+) =/g, (_, type: string, name: string) =>
      `var ${name}: ${type === 'float' ? 'f32' : 'vec3f'} =`)
    .replace(/\bvec3\(/g, 'vec3f(')
    .replace(/\batan\(/g, 'atan2(');
}

// 绘制也消费这些真实路径：细丝方向、节点位置、亮包传播不各造一套坐标。
const TOPOLOGY_GLSL = `
float neuralIdentity(float seed) { return floor(hash1(seed * 19.7 + 0.4) * ${NODE_COUNT}); }
float orbitIdentity(float seed) { return floor(hash1(seed * 73.1 + 0.71) * ${ORBIT_LANES}); }
float orbitCapacity(float growth) { return 3.0 + ${FORM_ORBIT_LANES - 3}.0 * pow(clamp(growth, 0.0, 1.0), 1.6); }
float pathwayPosition(float seed) { return hash1(seed * 13.7); }
// 绘制按各路径实际聚合进度切换细丝，不能用统一成长阈值抹糊已成形的片区。
float hologramReadiness(float seed, float growth) {
  if (seed < 0.07) { return 1.0; }
  if (seed < 0.16) { return smoothstep(0.08, 0.45, growth); }
  if (seed < 0.34) {
    float start = 0.12 + hash1(neuralIdentity(seed) * 3.7) * 0.30;
    return smoothstep(start, start + 0.18, growth);
  }
  if (seed < 0.50) {
    float lane = orbitIdentity(seed);
    return smoothstep(0.28, 0.86, growth) * smoothstep(lane, lane + 1.0, orbitCapacity(growth));
  }
  if (seed < 0.58) { return smoothstep(0.15, 0.65, growth); }
  if (seed < 0.74) { return 0.35 + 0.65 * smoothstep(0.10, 0.68, growth); }
  if (seed < 0.84) { return smoothstep(0.18, 0.72, growth); }
  if (seed < 0.90) { return smoothstep(0.45, 0.94, growth); }
  if (seed < 0.96) { return smoothstep(0.15, 0.72, growth); }
  return smoothstep(0.38, 0.94, growth);
}
float hologramLayer(float seed) {
  if (seed < 0.07) { return 0.0; }
  if (seed < 0.96) { return 1.0; }
  return 2.0;
}
float mainRingWeight(float seed) {
  return step(0.34, seed) * (1.0 - step(0.50, seed)) + step(0.96, seed);
}
float hologramFilament(float seed) {
  if ((seed >= 0.16 && seed < 0.34) || (seed >= 0.50 && seed < 0.58) || (seed >= 0.74 && seed < 0.84)) { return 0.88; }
  return 0.80;
}
vec3 fieldPoint(float longitude, float latitude, float radius, float time) {
  // 球层、节点与径向束共享倾斜自转轴，纬向短弧不能形成多组大环。
  vec3 q = vec3(cos(longitude) * cos(latitude), sin(latitude), sin(longitude) * cos(latitude)) * radius;
  float pitch = 0.22 + sin(time * 0.043) * 0.035;
  q = vec3(q.x, q.y * cos(pitch) - q.z * sin(pitch), q.y * sin(pitch) + q.z * cos(pitch));
  float roll = -0.10 + sin(time * 0.031) * 0.028;
  return vec3(q.x * cos(roll) - q.y * sin(roll), q.x * sin(roll) + q.y * cos(roll), q.z);
}
vec3 corePoint(float time) { return vec3(sin(time * 0.13) * 0.008, cos(time * 0.11) * 0.008, 0.0); }
float nodeLongitude(float node, float time) {
  // 固定角速度避免成长或长时运行改变相位；26.2 秒一圈。
  return node * 2.3999632 + (hash1(node * 13.7) - 0.5) * 0.26 + time * 0.24
       + sin(time * 0.13 + node * 1.7) * 0.025;
}
float nodeLatitude(float node) {
  return asin(1.0 - 2.0 * (node + 0.5) / ${NODE_COUNT}) + (hash1(node * 31.7) - 0.5) * 0.13;
}
vec3 neuralNode(float node, float time, float growth) {
  float latitude = nodeLatitude(node);
  float longitude = nodeLongitude(node, time);
  float radius = 0.94 + hash1(node * 17.3) * 0.10 + 0.018 * sin(node * 1.7 + time * 0.09);
  return fieldPoint(longitude, latitude, radius, time);
}
vec3 patchPoint(float node, float tier, float fiber, float along, float time, float growth) {
  // 球面电路：每片三条折线路径，长线、直角台阶与短末端有明确层级。
  float shard = floor(min(along, 0.9999) * 3.0);
  float local = fract(min(along, 0.9999) * 3.0);
  float routeX = min(local / 0.30, 1.0) * 0.38
               + clamp((local - 0.41) / 0.29, 0.0, 1.0) * 0.40
               + max((local - 0.81) / 0.19, 0.0) * 0.22;
  float routeY = clamp((local - 0.30) / 0.11, 0.0, 1.0)
               - clamp((local - 0.70) / 0.11, 0.0, 1.0) * 0.45;
  float span = 0.62 + hash1(node * 7.7 + tier * 2.3) * 0.54;
  float x = ((shard + routeX * (0.72 + hash1(node + shard * 7.1) * 0.22)) / 3.0 - 0.5) * span;
  float pitch = 0.012 + hash1(node * 23.3) * 0.009;
  float y = fiber * pitch + routeY * (hash1(node * 3.3 + shard) - 0.35) * 0.16;
  float angle = floor(hash1(node * 29.3) * 4.0) * 1.5707963 + (tier - 1.0) * 0.12;
  float latitude = nodeLatitude(node) + x * sin(angle) + y * cos(angle);
  float longitude = nodeLongitude(node, time) + (x * cos(angle) - y * sin(angle)) / max(0.40, cos(nodeLatitude(node)));
  longitude += (tier - 1.0) * 0.24;
  latitude += (hash1(node * 43.1 + tier * 7.7) - 0.5) * 0.16;
  float radius = 0.40 + tier * 0.29 + (hash1(node * 17.3) - 0.5) * 0.06;
  radius += (hash1(node * 5.3 + shard) - 0.5) * 0.028 + floor((fiber + 3.0) / 3.0) * 0.010;
  return fieldPoint(longitude, latitude, radius, time);
}
float orbitLongitude(float lane, float local, float time, float growth) {
  float shard = floor(local * 3.0);
  float along = fract(local * 3.0);
  float slot = floor(along * 40.0);
  float fillLen = 0.65 + 0.30 * hash1(lane * 3.7 + slot * 1.9 + shard * 7.1);
  along = (slot + fract(along * 40.0) * fillLen) / 40.0;
  float start = -0.28;
  float span = 1.57;
  if (shard > 0.5) { start = 2.02; span = 1.16; }
  if (shard > 1.5) { start = 3.80; span = 1.62; }
  return start + along * span + (hash1(lane * 13.3 + shard * 5.7) - 0.5) * 0.08 + time * 0.31;
}
vec3 orbitPoint(float lane, float local, float time, float growth) {
  float angle = orbitLongitude(lane, local, time, growth);
  float group = floor(lane / 6.0);
  float fiber = lane - group * 6.0;
  if (group > 2.5) {
    return patchPoint(lane - 12.0, 2.0, fiber - 2.5, local, time, growth);
  }
  // 只有内侧弧保留盘片方向；外侧两组弧绕球面分区，避免三层同心靶环。
  if (group > 0.5) {
    float latitude = (group - 1.5) * 0.82 + sin(angle * 2.0 + group) * 0.10;
    return fieldPoint(angle + group * 0.67, latitude, 0.91 + fiber * 0.007, time);
  }
  float radius = 0.48 + fiber * 0.006 + 0.035 * sin(angle * 2.0 + 0.8);
  float slot = floor(local * 120.0);
  radius += step(0.78, hash1(group * 9.3 + slot)) * 0.012;
  vec3 q = vec3(cos(angle) * radius - 0.09, sin(angle) * radius + 0.035, -0.08 + 0.035 * sin(angle));
  float tilt = 0.54;
  return vec3(q.x * cos(tilt) + q.z * sin(tilt), q.y, -q.x * sin(tilt) + q.z * cos(tilt));
}
vec3 shellPoint(float seed, float along, float time, float growth) {
  float pathAlong = along;
  float node = neuralIdentity(seed);
  float tier = floor(hash1(seed * 83.3) * 3.0);
  float fiber = floor(hash1(seed * 89.7) * 7.0) - 3.0;
  if (seed >= 0.74 && seed < 0.84) {
    float segment = floor(min(along, 0.9999) * 2.0);
    float local = fract(min(along, 0.9999) * 2.0);
    float across = min(local / 0.38, 1.0) * 0.45 + max((local - 0.57) / 0.43, 0.0) * 0.55;
    float turn = clamp((local - 0.38) / 0.19, 0.0, 1.0);
    float longitude = nodeLongitude(node, time) + (across - 0.5) * (0.28 + hash1(node * 19.3) * 0.32);
    float latitude = nodeLatitude(node) + fiber * 0.012 + segment * 0.08;
    float radius = 0.76 + segment * 0.22 + turn * (hash1(node * 11.7) - 0.35) * 0.12;
    return fieldPoint(longitude, latitude, radius, time);
  }
  // 每个片区既有主干，也有短跨接和矩形端口；所有细节仍在相同球面路径上。
  float detail = step(0.50, seed) * (1.0 - step(0.58, seed)) + step(0.90, seed) * (1.0 - step(0.96, seed));
  if (detail > 0.5) {
    float chip = step(0.90, seed);
    float slots = mix(6.0, 3.0, chip);
    float slot = floor(hash1(seed * 113.7) * slots);
    float center = (slot + 0.34) / slots;
    float edge = min(along, 0.9999) * 4.0;
    float x = min(edge, 1.0) - clamp(edge - 2.0, 0.0, 1.0);
    float y = clamp(edge - 1.0, 0.0, 1.0) - clamp(edge - 3.0, 0.0, 1.0);
    fiber = (floor(hash1(seed * 89.7) * 2.0) - 0.5) * 3.0;
    fiber += mix((along - 0.5) * 2.4, (y - 0.5) * 1.20, chip);
    pathAlong = center + (x - 0.5) * 0.040 * chip;
  }
  return patchPoint(node, tier, fiber, pathAlong, time, growth);
}
float channelIdentity(float seed) {
  return floor(hash1(seed * 173.1) * ${NODE_COUNT});
}
vec3 channelPoint(float node, float along, float time, float growth) {
  float longitude = nodeLongitude(node, time);
  float latitude = nodeLatitude(node);
  float reach = 0.80 + hash1(node * 3.3) * 0.32;
  float radius = 0.14 + along * reach;
  // 主干沿三维径向延伸，中段有一次直角转接，保持工业电路感。
  float elbow = clamp((along - 0.52) / 0.08, 0.0, 1.0);
  longitude += elbow * (hash1(node * 9.9) - 0.5) * 0.16;
  return fieldPoint(longitude, latitude, radius, time);
}
vec3 streamPoint(float stream, float along, float time, float growth, float arcStrength) {
  float shard = floor(along * 3.0);
  float local = fract(along * 3.0);
  float angle = -0.40 + shard * 2.05 + local * 1.35 + time * 0.075;
  float radius = 1.06 + stream * 0.018;
  vec3 q = vec3(cos(angle) * radius, sin(angle) * radius, (stream - 1.5) * 0.025);
  return vec3(q.x * 0.84 + q.z * 0.54, q.y, -q.x * 0.54 + q.z * 0.84);
}
vec3 ribbonPoint(float seed, float sr, float time, float growth) {
  // 穿过核心的横向传输线束，分束、错位端点和矩形转接；不是发光螺旋面。
  float lane = floor(hash1(seed * 3.71) * 18.0);
  // 三分之一纤维在核外回卷，衔接核心与传输束，填补中心周围的空洞。
  if (lane < 6.0) {
    float angle = 1.65 + sr * 4.45 + sin(time * 0.09) * 0.06;
    float radius = 0.16 + (1.0 - sr) * 0.24 + lane * 0.006;
    return vec3(cos(angle) * radius - 0.055, sin(angle) * radius + 0.055, (lane - 2.5) * 0.018 + sin(angle) * 0.10);
  }
  float side = lane - 8.5;
  float reach = 0.72 + hash1(lane * 7.3) * 0.38;
  float x = (sr - 0.43) * reach * 1.65;
  float bend = clamp((sr - 0.60) / 0.05, 0.0, 1.0);
  float y = side * 0.008 + bend * (hash1(lane * 13.7) - 0.5) * 0.12;
  float z = (hash1(lane * 11.3) - 0.5) * 0.10;
  return vec3(x, y + 0.025 * sin(time * 0.12), z);
}
// 外伸端口的锚点与绘制切线共用，不能退化为独立尘点。
vec3 portPoint(float seed, float along, float time) {
  float node = neuralIdentity(seed);
  float fiber = floor(hash1(seed * 71.9) * 4.0) - 1.5;
  float radial = min(along / 0.42, 1.0) - max((along - 0.62) / 0.38, 0.0) * 0.36;
  float crossbar = clamp((along - 0.42) / 0.20, 0.0, 1.0);
  float reach = 0.12 + hash1(node * 61.3) * 0.14;
  if (hash1(seed * 157.1) > 0.76) {
    float row = floor(hash1(seed * 163.7) * 3.0);
    float radius = 0.94 + reach * (0.52 + row * 0.23);
    return fieldPoint(nodeLongitude(node, time) + 0.065, nodeLatitude(node) + (along - 0.5) * 0.036, radius, time);
  }
  float radius = 0.94 + radial * (0.12 + hash1(node * 61.3) * 0.14);
  return fieldPoint(nodeLongitude(node, time) + crossbar * 0.065, nodeLatitude(node) + fiber * 0.012, radius, time);
}
vec3 shellDirection(float seed, float time, float growth) {
  float along = pathwayPosition(seed);
  float cells = 3.0;
  if (seed >= 0.74 && seed < 0.84) { cells = 2.0; }
  if (seed >= 0.90 && seed < 0.96) { cells = 4.0; }
  float cell = floor(along * cells);
  float lower = cell / cells + 0.0001;
  float upper = (cell + 1.0) / cells - 0.0001;
  return shellPoint(seed, min(upper, along + 0.0005), time, growth)
       - shellPoint(seed, max(lower, along - 0.0005), time, growth);
}
vec3 hologramThread(float seed, float time, float growth) {
  float along = pathwayPosition(seed);
  if (seed >= 0.07 && seed < 0.16) {
    return ribbonPoint(seed, min(1.0, along + 0.012), time, growth)
         - ribbonPoint(seed, max(0.0, along - 0.012), time, growth);
  }
  if (seed >= 0.16 && seed < 0.34) {
    return shellDirection(seed, time, growth);
  }
  if (seed >= 0.34 && seed < 0.50) {
    float lane = orbitIdentity(seed);
    float local = hash1(seed * 37.7 + 0.13);
    float cell = floor(local * 120.0);
    float lower = cell / 120.0 + 0.00005;
    float upper = (cell + 1.0) / 120.0 - 0.00005;
    return orbitPoint(lane, min(upper, local + 0.0008), time, growth)
         - orbitPoint(lane, max(lower, local - 0.0008), time, growth);
  }
  if ((seed >= 0.50 && seed < 0.58) || (seed >= 0.74 && seed < 0.84) || (seed >= 0.90 && seed < 0.96)) {
    return shellDirection(seed, time, growth);
  }
  if (seed >= 0.58 && seed < 0.74) {
    float node = channelIdentity(seed);
    return channelPoint(node, min(1.0, along + 0.012), time, growth)
         - channelPoint(node, max(0.0, along - 0.012), time, growth);
  }
  if (seed >= 0.84 && seed < 0.90) {
    return portPoint(seed, min(1.0, along + 0.002), time)
         - portPoint(seed, max(0.0, along - 0.002), time);
  }
  if (seed >= 0.96) {
    float stream = floor(hash1(seed * 83.1) * 4.0);
    float arcStrength = smoothstep(0.72, 0.98, growth);
    float cell = floor(along * 24.0);
    float lower = cell / 24.0 + 0.0001;
    float upper = (cell + 1.0) / 24.0 - 0.0001;
    return streamPoint(stream, min(upper, along + 0.002), time, growth, arcStrength)
         - streamPoint(stream, max(lower, along - 0.002), time, growth, arcStrength);
  }
  return vec3(0.0);
}
`;

export const HOLOGRAM_GLSL = TOPOLOGY_GLSL + `
vec3 looseAnchor(float seed, float time, float growth) {
  float strand = floor(hash1(seed * 157.7) * 3.0);
  float u = hash1(seed * 149.1);
  float angle = strand * 2.25 + u * 4.7 + time * (0.025 + strand * 0.008);
  float radius = 0.16 + u * 0.72;
  vec3 q = fieldPoint(angle, sin(u * 5.0 + strand) * 0.65, radius, time);
  vec3 dust = vec3(hash1(seed * 23.7), hash1(seed * 29.1), hash1(seed * 31.3)) * 2.0 - 1.0;
  return q + dust * (0.020 + u * 0.038);
}
vec3 orbitAnchor(float seed, float time, float growth) {
  float lane = orbitIdentity(seed);
  float local = hash1(seed * 37.7 + 0.13);
  vec3 q = orbitPoint(lane, local, time, growth);
  vec3 grain = vec3(hash1(seed * 91.31), hash1(seed * 137.3), hash1(seed * 139.1)) * 2.0 - 1.0;
  q += grain * 0.0015;
  return mix(looseAnchor(seed, time, growth), q, hologramReadiness(seed, growth));
}
vec3 structuredAnchor(float seed, float time, float growth, float arcStrength) {
  float g = clamp(growth, 0.0, 1.0);
  if (seed < 0.07) {
    // 中央多层小环腔：有厚度与暗心，热量集中在局部弧段。
    float ringId = floor(hash1(seed * 13.9) * 5.0);
    float u = hash1(seed * 5.17) * (5.3 + hash1(ringId * 3.7) * 0.8) + ringId * 0.65 + time * 0.12;
    float v = hash1(seed * 7.31) * 6.2831853;
    float radius = 0.046 + ringId * 0.023 + cos(v) * 0.005 + sin(u * 2.0 + ringId) * 0.006;
    vec3 q = vec3(cos(u) * radius - ringId * 0.012, sin(u) * radius + ringId * 0.009, (ringId - 2.0) * 0.018 + sin(v) * 0.008 + radius * 0.55 * sin(u + ringId * 1.3));
    float turn = 0.18 + ringId * 0.28 + sin(time * 0.13) * 0.08;
    return corePoint(time) + vec3(q.x * cos(turn) + q.z * sin(turn), q.y, -q.x * sin(turn) + q.z * cos(turn));
  }
  if (seed < 0.16) {
    // 横向传输束从芽核向外逐步延伸。
    vec3 q = ribbonPoint(seed, pathwayPosition(seed), time, g);
    return mix(looseAnchor(seed, time, g), q, hologramReadiness(seed, g));
  }
  if (seed < 0.34) {
    float along = pathwayPosition(seed);
    vec3 grain = vec3(hash1(seed * 97.3), hash1(seed * 101.7), hash1(seed * 109.1)) * 2.0 - 1.0;
    vec3 q = shellPoint(seed, along, time, g) + grain * 0.002;
    return mix(looseAnchor(seed, time, g) * 0.72, q, hologramReadiness(seed, g));
  }
  if (seed < 0.50) { return orbitAnchor(seed, time, g); }
  if (seed < 0.58) { return mix(looseAnchor(seed, time, g), shellPoint(seed, pathwayPosition(seed), time, g), hologramReadiness(seed, g)); }
  if (seed < 0.74) {
    float node = channelIdentity(seed);
    float along = pathwayPosition(seed);
    vec3 q = channelPoint(node, along, time, g);
    vec3 radial = normalize(q + vec3(0.00001));
    vec3 side = normalize(cross(radial, vec3(0.0, 0.0, 1.0)) + vec3(0.00001, 0.0, 0.0));
    float isBeam = 1.0;
    float fiber = floor(hash1(seed * 179.3) * 7.0) - 3.0;
    float width = 0.002 + pow(hash1(node * 11.1), 2.5) * 0.003;
    q += side * mix((floor(hash1(seed * 179.3) * 3.0) - 1.0) * 0.005, fiber * width, isBeam);
    float forkOn = isBeam * step(0.5, hash1(node * 43.7));
    q += side * smoothstep(0.5, 0.98, along) * step(0.5, fiber) * forkOn * (0.05 + 0.08 * hash1(node * 47.1));
    return mix(looseAnchor(seed, time, g) * 0.65, q, hologramReadiness(seed, g));
  }
  if (seed < 0.84) {
    vec3 q = shellPoint(seed, pathwayPosition(seed), time, g);
    vec3 grain = vec3(hash1(seed * 97.3), hash1(seed * 101.7), hash1(seed * 109.1)) * 2.0 - 1.0;
    q += grain * 0.002;
    return mix(looseAnchor(seed, time, g), q, hologramReadiness(seed, g));
  }
  if (seed < 0.90) {
    vec3 q = portPoint(seed, pathwayPosition(seed), time);
    return mix(looseAnchor(seed, time, g), q, hologramReadiness(seed, g));
  }
  if (seed < 0.96) {
    // 体积颗粒靠拢同一片区，填入厚度；不重新补出均匀封闭球面。
    vec3 q = shellPoint(seed, pathwayPosition(seed), time, g);
    vec3 grain = vec3(hash1(seed * 239.3), hash1(seed * 241.7), hash1(seed * 257.1)) * 2.0 - 1.0;
    q += grain * 0.001;
    return mix(looseAnchor(seed, time, g), q, hologramReadiness(seed, g));
  }
  // 主环的伴随流与短尾迹；同一环面内保持少量径向厚度。
  float stream = floor(hash1(seed * 83.1) * 4.0);
  float along = pathwayPosition(seed);
  vec3 q = streamPoint(stream, along, time, g, arcStrength);
  float fiber = floor(hash1(seed * 87.7) * 5.0) - 2.0;
  q *= 1.0 + (hash1(seed * 89.3) - 0.5) * 0.012;
  q += vec3(0.0, 0.0, (hash1(seed * 91.1) - 0.5) * 0.006);
  return mix(looseAnchor(seed, time, g), q, hologramReadiness(seed, g));
}
vec3 hologramAnchor(float seed, float time, float growth, float arcStrength) {
  float g = clamp(growth, 0.0, 1.0);
  vec3 structure = structuredAnchor(seed, time, g, arcStrength);
  vec3 cloud = looseAnchor(seed, time, g);
  float assembleAt = hash1(floor(seed * 47.0) * 3.17 + 0.4) * 0.32;
  float cohesion = smoothstep(assembleAt, assembleAt + 0.14, g);
  if (seed < 0.16) { cohesion = 1.0; }
  if (seed >= 0.58 && seed < 0.74) { cohesion = 0.65 + smoothstep(0.08, 0.42, g) * 0.35; }
  float sector = floor(hash1(seed * 73.1 + 0.71) * 12.0);
  float activity = sin(time * 0.37 + sector * 2.1) * sin(time * 0.173 + sector * 0.73);
  float release = smoothstep(0.72, 0.96, activity) * (0.002 + 0.003 * g);
  vec3 q = mix(cloud, structure, cohesion * (1.0 - release));
  // 少量颗粒周期性脱离球层/环带再回流（不含径向束与核心）。
  float roamer = step(0.995, hash1(seed * 331.7)) * step(0.16, seed) * (1.0 - step(0.58, seed) * (1.0 - step(0.74, seed)));
  float cycle = fract(time * 0.07 + hash1(seed * 17.9));
  float excursion = pow(sin(cycle * 3.1415927), 2.0) * (0.05 + 0.16 * hash1(seed * 23.3));
  q += normalize(q + vec3(0.00001)) * excursion * roamer * g;
  vec3 drift = vec3(sin(q.y * 3.2 + time * 0.43), sin(q.z * 4.1 - time * 0.31), cos(q.x * 3.7 + time * 0.29));
  q += drift * (0.004 + 0.010 * (1.0 - g));
  float breath = sin(time * 0.81 + q.y * 2.4) + 0.45 * sin(time * 0.33 + q.x * 3.1);
  q *= (0.58 + 0.42 * smoothstep(0.02, 0.86, g)) * (1.0 + breath * 0.012);
  return q;
}
`;
export const HOLOGRAM_WGSL = toWGSL(HOLOGRAM_GLSL);

export const HOLOGRAM_SIGNAL_GLSL = TOPOLOGY_GLSL + `
float pathwayPacket(float route, float along, float time) {
  float front = fract(time * (0.10 + hash1(route * 7.1) * 0.045) - route * 0.137);
  return 1.0 - smoothstep(0.025, 0.10, abs(along - front));
}
// 半透明粒子体的深度分层近似，不写实体遮挡深度。
float hologramTransmission(float depth) {
  float front = smoothstep(-0.65, 0.65, depth);
  return mix(0.30, 1.32, front);
}
float hologramFocus(float depth) {
  return 1.0 + (1.0 - smoothstep(-0.85, 0.15, depth)) * 0.32;
}
float hologramLineScale(float seed) {
  if (seed < 0.07) { return 1.0; }
  if (seed < 0.16) { return 1.05; }
  if (seed >= 0.90 && seed < 0.96) { return 0.48; }
  if (seed >= 0.50 && seed < 0.58) { return 0.58; }
  if (seed >= 0.84 && seed < 0.90) { return 0.82; }
  if (seed >= 0.34 && seed < 0.50) { return 0.72; }
  float trunk = 1.0 - step(0.5, abs(floor(hash1(seed * 89.7) * 7.0) - 3.0));
  return mix(0.70, 1.16, trunk);
}
// 图案不同的粒芯宽度；长度仍由路径族控制，保持同预算。
float hologramAspect(float seed) {
  if (seed < 0.07) { return 1.0; }
  if (seed >= 0.90 && seed < 0.96) { return 2.8; }
  if (seed >= 0.84 && seed < 0.90) { return 4.5; }
  if (seed >= 0.07 && seed < 0.16) { return 5.5; }
  return 8.5;
}
// 调整精灵长宽后补偿投影覆盖，防止密排线因变细而整体变暗。
float hologramCoverage(float seed) {
  if (seed < 0.07) { return 1.0; }
  float size = hologramLineScale(seed);
  return clamp(hologramAspect(seed) / (7.0 * size * size), 0.65, 2.2);
}
float hologramExposureBase(float seed, float growth) {
  if (seed < 0.07) { return 0.86; }
  if (seed < 0.16) { return 0.48; }
  if (seed < 0.34) { return 0.30 + smoothstep(0.10, 0.78, growth) * (0.70 + hash1(neuralIdentity(seed) * 53.1) * 0.45); }
  if (seed < 0.50) {
    float capacity = smoothstep(orbitIdentity(seed), orbitIdentity(seed) + 1.0, orbitCapacity(growth));
    return 0.035 + capacity * smoothstep(0.28, 0.86, growth) * 0.335;
  }
  if (seed < 0.58) { return 0.35 + smoothstep(0.15, 0.65, growth) * 0.62; }
  if (seed < 0.74) {
    float trunk = pow(hash1(channelIdentity(seed) * 11.1), 3.0);
    return 0.15 + smoothstep(0.16, 0.88, growth) * (0.12 + trunk * 0.95);
  }
  if (seed < 0.84) { return 0.28 + smoothstep(0.18, 0.72, growth) * 0.82; }
  if (seed < 0.90) {
    float terminal = smoothstep(0.88, 0.98, pathwayPosition(seed));
    return 0.10 + smoothstep(0.45, 0.94, growth) * (0.60 + terminal * 0.55);
  }
  if (seed < 0.96) { return 0.32 + smoothstep(0.15, 0.72, growth) * 0.75; }
  return 0.06 + smoothstep(0.38, 0.94, growth) * 0.12;
}
float hologramExposure(float seed, float growth) {
  float alive = 1.0;
  if ((seed >= 0.16 && seed < 0.34) || (seed >= 0.50 && seed < 0.58) || (seed >= 0.74 && seed < 0.84) || (seed >= 0.90 && seed < 0.96)) {
    float patchId = neuralIdentity(seed);
    float blk = floor(pathwayPosition(seed) * 36.0);
    float fiber = floor(hash1(seed * 89.7) * 7.0);
    float trunk = 1.0 - step(0.5, abs(fiber - 3.0));
    alive = (0.52 + 0.70 * pow(hash1(patchId * 3.7 + floor(blk / 4.0) * 5.9), 2.0)) * (0.76 + trunk * 0.70);
  }
  return hologramExposureBase(seed, growth) * alive;
}
float hologramHeat(float seed, float time, float growth) {
  float warm = smoothstep(0.25, 0.95, growth);
  if (seed < 0.07) {
    float heat = hash1(seed * 207.1);
    return (0.10 + heat * 0.25 + step(0.80, heat) * 0.25) * warm;
  }
  if (seed < 0.16) { return 0.06 * warm; }
  if (seed >= 0.58 && seed < 0.74) {
    float along = pathwayPosition(seed);
    float packet = pathwayPacket(channelIdentity(seed), along, time);
    return (1.0 - along) * (0.04 + packet * 0.10) * warm;
  }
  float contact = 1.0 - smoothstep(0.0, 0.055, abs(fract(pathwayPosition(seed) * 3.0) - 0.70));
  return (mainRingWeight(seed) * 0.06 + contact * 0.32) * warm;
}
float hologramHalo(float seed, float time, float growth) {
  float selectHotspot = step(0.985, hash1(seed * 229.7));
  if (seed >= 0.84 && seed < 0.90) {
    return smoothstep(0.94, 0.99, pathwayPosition(seed)) * 0.65 * smoothstep(0.45, 0.94, growth);
  }
  if (seed >= 0.90 && seed < 0.96) {
    return step(0.97, hash1(seed * 229.7)) * 0.85 * smoothstep(0.40, 0.95, growth);
  }
  if (seed < 0.07) {
    return (0.16 + step(0.92, hash1(seed * 229.7)) * 0.58) * (0.55 + growth * 0.45);
  }
  if (seed >= 0.16 && seed < 0.34) {
    return step(0.955, hash1(seed * 229.7)) * step(0.82, fract(pathwayPosition(seed) * 3.0)) * 0.65 * smoothstep(0.25, 0.95, growth);
  }
  if (seed >= 0.58 && seed < 0.74) {
    float along = pathwayPosition(seed);
    return selectHotspot * pathwayPacket(channelIdentity(seed), along, time) * 0.60 * smoothstep(0.25, 0.95, growth);
  }
  return selectHotspot * mainRingWeight(seed) * 0.42 * smoothstep(0.38, 0.95, growth);
}
float hologramSignal(float seed, float time, float growth) {
  float route = neuralIdentity(seed);
  float along = pathwayPosition(seed);
  if (seed >= 0.34 && seed < 0.50) { route = orbitIdentity(seed); along = hash1(seed * 37.7 + 0.13); }
  if (seed >= 0.58 && seed < 0.74) { route = channelIdentity(seed); }
  if (seed >= 0.96) { route = floor(hash1(seed * 83.1) * 4.0); }
  float packet = pathwayPacket(route, along, time);
  float organized = 0.18 + 0.82 * smoothstep(0.10, 0.78, growth);
  if (seed < 0.07) { return 1.15 + growth * 0.20 + 0.14 * sin(time * 1.3 + along * 4.0); }
  if (seed >= 0.58 && seed < 0.74) { return 0.85 + packet * organized * 0.55; }
  if (seed >= 0.90 && seed < 0.96) { return 0.86 + 0.08 * sin(time * 0.9 + along * 4.0); }
  if (mainRingWeight(seed) > 0.5) { return 0.85 + packet * organized * 0.55; }
  return 0.74 + packet * organized * 0.50;
}
`;
export const HOLOGRAM_SIGNAL_WGSL = toWGSL(HOLOGRAM_SIGNAL_GLSL.slice(TOPOLOGY_GLSL.length));

export const ATTENTION_SIGNAL_GLSL = `
float attentionSignal(float seed, float phase, float focus, float attention, float pulse, float growth, float time) {
  float node = neuralIdentity(seed);
  if (seed >= 0.58 && seed < 0.74) { node = channelIdentity(seed); }
  vec3 direction = neuralNode(node, time, growth);
  float angle = atan(direction.y, direction.x);
  float scan = pow(0.5 + 0.5 * cos(angle - focus), 5.0);
  float along = pathwayPosition(seed);
  float front = fract(phase - node * 0.037);
  float incoming = 1.0 - smoothstep(0.04, 0.22, abs(along - (1.0 - front)));
  float outgoing = 1.0 - smoothstep(0.04, 0.18, abs(along - front));
  float organized = 0.18 + 0.82 * smoothstep(0.10, 0.78, growth);
  if (seed < 0.07) { return 0.90 + pulse * 0.16; }
  float path = smoothstep(0.14, 0.18, seed) * (1.0 - smoothstep(0.32, 0.36, seed));
  path += smoothstep(0.56, 0.60, seed) * (1.0 - smoothstep(0.72, 0.76, seed));
  return 0.90 + path * organized * (scan * attention * (0.25 + incoming * 1.10) + outgoing * pulse * 0.85);
}
`;
export const ATTENTION_SIGNAL_WGSL = toWGSL(ATTENTION_SIGNAL_GLSL);
