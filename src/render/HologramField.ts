/**
 * 粒子全息骨架：共享数学表达式生成两种 GPU 语言；只提供力场目标，不创建球体模型。
 * 四形态 Origin→Emerge 共用同一母体，差别在结构复杂度（与 GrowthEngine.formStructure 同曲线）。
 * 种子族：核心云 / 内旋涡 / 神经网 / 轨道 / 径向脉络 / 粒子膜 / 碎片 / 弧流 / 游离云。
 */
export const HOLOGRAM_GLSL = `
vec3 structuredAnchor(float seed, float time, float growth) {
  float g = clamp(growth, 0.0, 1.0);
  // 与 GrowthEngine.formStructure 同曲线（禁止单侧改公式）。
  float orbitDensity = pow(g, 1.6);
  float neural = smoothstep(0.30, 0.85, g);
  float spoke = smoothstep(0.20, 0.50, g) * (1.0 - 0.55 * smoothstep(0.78, 1.00, g));
  float membrane = smoothstep(0.18, 0.55, g);
  float fragment = smoothstep(0.5, 0.9, g);
  float streamArc = smoothstep(0.72, 0.98, g);
  float vortex = 0.22 + 0.78 * smoothstep(0.12, 0.55, g);
  float coreGlow = 0.28 + 0.72 * g;
  float structureMix = 0.32 + 0.68 * g;

  float lane = floor(hash1(seed * 73.1 + 0.71) * 16.0);
  float family = hash1(lane * 17.17 + 0.2);
  float phase = hash1(seed * 37.7 + 0.13);
  // 相位量化 + 截断：轨道永不封口成完整圆（截断更狠，避免侧视成直径星芒）。
  phase = (floor(phase * 48.0) + min(fract(phase * 48.0), 0.55)) / 48.0;
  // 每条轨道保留一段较大的缺口，而非仅由密集小点拼成闭环。
  phase = phase * (0.60 + 0.20 * family);
  float angle = phase * 6.2831853 + time * (0.018 + family * 0.045 + orbitDensity * 0.028);
  float tilt = family * 2.6 + 0.25;
  float heading = hash1(lane * 3.71) * 6.2831853 + time * 0.016;
  float radius = 0.55 + hash1(lane * 8.31) * 0.64;

  if (seed < 0.07) {
    // 核心云：很小但明亮的能量核（避免粒子过密过曝）。
    float ca = hash1(seed * 5.17) * 6.2831853 + time * 0.05;
    float cz = hash1(seed * 7.31) * 2.0 - 1.0;
    float cxy = sqrt(max(0.0, 1.0 - cz * cz));
    radius = (0.12 + hash1(seed * 11.3) * 0.16) * (0.85 + 0.3 * coreGlow);
    return vec3(cos(ca) * cxy, sin(ca) * cxy, cz) * radius;
  }
  if (seed < 0.16) {
    // 内旋涡：绕核的弥散旋涡云——连续角/连续半径分布 + 纵向厚度，整体缓慢旋转。
    // 离散弧段在任何小半径上都会读成高亮「蚯蚓/圆环」（用户反馈），必须摊开成云。
    float swirlT = time * (0.08 + 0.18 * vortex) + hash1(seed * 9.3) * 6.2831853;
    float direction = -0.85;
    if (family > 0.5) { direction = 1.0; }
    float va = hash1(seed * 37.7 + 5.1) * 6.2831853 + swirlT * direction;
    float vradius = 0.16 + hash1(seed * 3.71) * 0.42;
    vradius = vradius * (1.0 + 0.10 * sin(va * 2.0 + time * 0.21));
    tilt = 0.4 + family * 1.8;
    float width = (hash1(seed * 19.1) - 0.5) * 0.10;
    vec3 q = vec3(cos(va) * vradius, sin(va) * vradius * cos(tilt), sin(va) * vradius * sin(tilt) + width);
    return vec3(q.x * cos(heading) + q.z * sin(heading), q.y, -q.x * sin(heading) + q.z * cos(heading));
  }
  if (seed < 0.34 && neural > 0.01) {
    // 神经网：高亮节点 + 沿连线游走的信号粒子。
    float node = floor(hash1(seed * 19.7 + 0.4) * 24.0);
    float na = node * 2.3999632 + time * 0.02;
    float nz = 1.0 - 2.0 * (node + 0.5) / 24.0;
    float nxy = sqrt(max(0.0, 1.0 - nz * nz));
    float shell = 0.55 + 0.26 * hash1(node * 3.1);
    vec3 nodePos = vec3(cos(na) * nxy, sin(na) * nxy, nz) * shell;
    if (hash1(seed * 41.3) < 0.72) {
      float cycle = time * (0.035 + 0.015 * hash1(node * 3.7));
      float epoch = floor(cycle);
      float node2 = floor(hash1(node * 27.1 + epoch + 0.9) * 24.0);
      float a2 = node2 * 2.3999632 + time * 0.02;
      float z2 = 1.0 - 2.0 * (node2 + 0.5) / 24.0;
      float xy2 = sqrt(max(0.0, 1.0 - z2 * z2));
      vec3 node2Pos = vec3(cos(a2) * xy2, sin(a2) * xy2, z2) * shell;
      float nextNode = floor(hash1(node * 27.1 + epoch + 1.9) * 24.0);
      float nextA = nextNode * 2.3999632 + time * 0.02;
      float nextZ = 1.0 - 2.0 * (nextNode + 0.5) / 24.0;
      float nextXY = sqrt(max(0.0, 1.0 - nextZ * nextZ));
      vec3 nextPos = vec3(cos(nextA) * nextXY, sin(nextA) * nextXY, nextZ) * shell;
      node2Pos = mix(node2Pos, nextPos, smoothstep(0.72, 1.0, fract(cycle)));
      float travel = fract(hash1(seed * 13.7) + time * (0.035 + 0.06 * neural));
      return mix(nodePos, node2Pos, travel);
    }
    // 节点是微小粒子簇，不把几百颗粒子压成同一个过曝像素。
    float jitter = hash1(seed * 97.3) * 6.2831853;
    return nodePos + vec3(cos(jitter), sin(jitter), sin(jitter * 1.7)) * 0.025;
  }
  if (seed < 0.66) {
    // 轨道族：主结构。条数随 orbitDensity 增加，始终断续。
    float activeLanes = 3.0 + 11.0 * orbitDensity;
    if (lane > activeLanes) {
      float freeA = hash1(seed * 55.3) * 6.2831853 + time * 0.03;
      float freeZ = hash1(seed * 77.1) * 2.0 - 1.0;
      float freeXY = sqrt(max(0.0, 1.0 - freeZ * freeZ));
      radius = 0.38 + hash1(seed * 91.7) * (0.55 + 0.7 * (1.0 - structureMix));
      return vec3(cos(freeA) * freeXY, sin(freeA) * freeXY, freeZ) * radius;
    }
    radius = 0.55 + hash1(lane * 8.31) * 0.64;
    // 成熟期轨道抖动收窄：粒子串成更细的火花链（参考图 3 的环轨质感）。
    radius = radius * (1.0 + 0.025 * (1.0 - 0.5 * g) * sin(angle * 3.0 + time * 0.23 + lane));
    // 轨道偏心：不全部穿过几何中心，减少侧视直径星芒。
    float ecc = (hash1(lane * 15.7) - 0.5) * 0.35;
    radius = radius * (1.0 + ecc * cos(angle));
  } else if (seed < 0.74) {
    if (spoke > 0.02) {
      // 径向脉络：从核心伸向外壳的辐射丝（参考图 2 的放射组织态），末端趋亮。
      float spokeIdx = floor(hash1(seed * 41.7) * 18.0);
      float sa = spokeIdx * 2.3999632 + time * 0.015;
      float sz = 1.0 - 2.0 * (spokeIdx + 0.5) / 18.0;
      float sxy = sqrt(max(0.0, 1.0 - sz * sz));
      float along = pow(hash1(seed * 43.1), 0.75);
      float sr = mix(0.10, 0.92 + hash1(spokeIdx * 5.3) * 0.10, along);
      vec3 sdir = vec3(cos(sa) * sxy, sin(sa) * sxy, sz);
      // 脉络微弯 + 轻散点：避免直射线在侧视时退化成星芒。
      float bend = sin(sa * 2.3 + time * 0.12) * 0.05 * along;
      vec3 side = normalize(cross(sdir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
      vec3 q = sdir * sr + side * bend
             + vec3(hash1(seed * 7.7), hash1(seed * 9.1), hash1(seed * 11.3)) * 0.014;
      return q * (0.92 + 0.08 * spoke);
    }
    // 脉络未激活（Origin）：回落为自由漂浮粒子。
    float freeA = hash1(seed * 55.3) * 6.2831853 + time * 0.03;
    float freeZ = hash1(seed * 77.1) * 2.0 - 1.0;
    float freeXY = sqrt(max(0.0, 1.0 - freeZ * freeZ));
    return vec3(cos(freeA) * freeXY, sin(freeA) * freeXY, freeZ) * (0.38 + hash1(seed * 91.7) * 0.55);
  } else if (seed < 0.84 && membrane > 0.01) {
    // 粒子膜：球面云 + 大缺口（不画经线，避免星芒）。
    float lon = hash1(seed * 23.1) * 6.2831853 + time * 0.012;
    float lat = (hash1(seed * 29.7) - 0.5) * 2.2;
    radius = 0.88 + 0.10 * sin(lon * 2.0 + lat * 3.0 + time * 0.12);
    float gap = fract(hash1(seed * 31.7) * 3.0 + lon * 0.15 + time * 0.008);
    // 大片缺口：约一半膜粒子退回内层，形成不完整膜。
    if (gap < 0.48) {
      radius = radius * 0.72;
    }
    vec3 shellQ = vec3(cos(lon) * cos(lat), sin(lon) * cos(lat), sin(lat)) * radius;
    return shellQ;
  } else if (seed < 0.90 && fragment > 0.01) {
    // 外围碎片与独立粒子群。
    float fa = hash1(seed * 61.3) * 6.2831853 + time * 0.02;
    float fz = hash1(seed * 67.1) * 2.0 - 1.0;
    float fxy = sqrt(max(0.0, 1.0 - fz * fz));
    radius = 1.14 + hash1(seed * 71.9) * 0.36;
    float cluster = floor(lane / 5.0);
    fa = fa + cluster * 0.7;
    radius = radius + 0.12 * sin(time * 0.4 + cluster);
    return vec3(cos(fa) * fxy, sin(fa) * fxy, fz) * radius;
  } else if (seed > 0.90) {
    // 弧流：脱离主体后绕行再入核（Emerge 明显）。
    float t = fract(time * (0.05 + 0.04 * streamArc) + hash1(seed * 83.1));
    float arcA = hash1(seed * 89.3) * 6.2831853 + t * 3.2;
    float arcR = 0.30 + sin(t * 3.14159) * (0.85 + 0.85 * streamArc);
    float arcY = (hash1(seed * 97.7) - 0.5) * (0.7 + 0.7 * streamArc) * sin(t * 3.14159);
    return vec3(cos(arcA) * arcR, arcY, sin(arcA) * arcR);
  }

  // 轨道锚点（含未激活神经/膜/碎片时的回落）。
  // 小半径统一开更大缺口：任何半径上的近闭合密集弧都会读成「蚯蚓」（用户反馈）。
  angle = angle * mix(0.55, 1.0, smoothstep(0.45, 0.95, radius));
  float width = (hash1(seed * 91.31) - 0.5) * 0.028 * (1.0 - 0.5 * g);
  vec3 q = vec3(cos(angle) * radius, sin(angle) * radius * cos(tilt), sin(angle) * radius * sin(tilt) + width);
  // 轨道中心偏移：打断「全部过心」的星芒。
  float ox = (hash1(lane * 3.3) - 0.5) * 0.28 * g;
  float oy = (hash1(lane * 5.7) - 0.5) * 0.22 * g;
  float oz = (hash1(lane * 7.1) - 0.5) * 0.26 * g;
  q = q + vec3(ox, oy, oz);
  q = q + vec3(sin(angle * 9.0 + lane), cos(angle * 7.0), sin(angle * 5.0)) * g * 0.014;
  return vec3(q.x * cos(heading) + q.z * sin(heading), q.y, -q.x * sin(heading) + q.z * cos(heading));
}

vec3 looseAnchor(float seed, float time, float growth) {
  // 飘带云：少数几条由内向外缠绕的卷曲流带 + 沿带弥散尘（Origin/Awaken 的主导形态，
  // 参考最早实拍 sheet.jpg 的丝缕），亮核自然出现在各带收拢的内端。
  float strand = floor(hash1(seed * 157.7) * 4.0);
  float u = hash1(seed * 149.1);
  float baseA = strand * 1.9 + hash1(strand * 7.3) * 1.4;
  float wind = 2.2 + hash1(strand * 11.7) * 1.6;
  float tilt = (hash1(strand * 13.1) - 0.5) * 1.3;
  float speed = 0.03 + hash1(strand * 17.3) * 0.02;
  float a = baseA + u * wind * 3.14159 + time * speed;
  float r = 0.18 + u * (0.95 + hash1(strand * 19.7) * 0.25);
  // 带内横向散布随 u 展开：内端收拢成亮芯，外端散成尘。
  float w = 0.012 + u * 0.045;
  vec3 c = vec3(cos(a), sin(a) * cos(tilt), sin(a) * sin(tilt)) * r;
  c.y += sin(u * 9.0 + strand * 2.0 + time * 0.12) * 0.10 * u;
  vec3 jitter = vec3(hash1(seed * 23.7), hash1(seed * 29.1), hash1(seed * 31.3)) * 2.0 - 1.0;
  return c + jitter * w;
}

// 同一碎弧共享漂移和倾角，避免退化成无结构的随机散点。
vec3 brokenArcAnchor(float seed, float time, float growth) {
  float lane = floor(hash1(seed * 211.3) * 12.0);
  float local = hash1(seed * 223.7);
  float phase = hash1(lane * 17.3) * 6.2831853;
  float speed = 0.035 + hash1(lane * 19.7) * 0.065;
  float direction = 1.0;
  if (hash1(lane * 31.7) < 0.5) { direction = -1.0; }
  float release = pow(max(0.0, sin(time * 0.21 + phase)), 3.0);
  float radius = 0.94 + hash1(lane * 29.1) * 0.22 + release * (0.06 + growth * 0.3);
  float angle = phase + time * speed * direction + (local - 0.5) * (0.25 + growth * 0.5);
  float tilt = hash1(lane * 37.3) * 2.7;
  vec3 q = vec3(cos(angle), sin(angle) * cos(tilt), sin(angle) * sin(tilt)) * radius;
  vec3 wander = vec3(sin(time * 0.17 + phase), cos(time * 0.113 + phase * 1.3), sin(time * 0.137 - phase));
  q += wander * (0.02 + release * 0.12) * (0.3 + growth * 0.7);
  q += vec3(sin(local * 17.0), cos(local * 13.0), sin(local * 11.0)) * 0.009;
  return q;
}

vec3 hologramAnchor(float seed, float time, float growth) {
  float g = clamp(growth, 0.0, 1.0);
  vec3 cloud = looseAnchor(seed, time, growth);
  if (seed < 0.07) { cloud *= 0.2; }
  vec3 structure = structuredAnchor(seed, time, growth);
  // 按粒子簇逐批凝成结构，避免每颗粒子都停在“云与轨道中间”而糊成一团。
  float assembleAt = hash1(floor(seed * 47.0) * 3.17 + 0.4) * 0.84;
  float cohesion = smoothstep(assembleAt, assembleAt + 0.14, g);
  if (seed < 0.16) { cohesion = 0.60 + g * 0.4; }
  if (seed >= 0.16 && seed < 0.34) { cohesion *= pow(smoothstep(0.38, 0.78, g), 0.35); }
  if (seed >= 0.66 && seed < 0.74) { cohesion *= pow(smoothstep(0.20, 0.50, g), 0.35); }
  if (seed >= 0.74 && seed < 0.84) { cohesion *= smoothstep(0.18, 0.55, g); }
  if (seed >= 0.84) { cohesion *= 0.7; }
  // 局部结构错相松脱；由两种不同周期共同驱动，避免整团同步跳动。
  float sector = floor(hash1(seed * 73.1 + 0.71) * 12.0);
  float activity = sin(time * 0.37 + sector * 2.1) * sin(time * 0.173 + sector * 0.73);
  float release = smoothstep(0.56, 0.94, activity) * (0.08 + 0.12 * g);
  vec3 q = mix(cloud, structure, cohesion * (1.0 - release));
  // 四阶段都保留漂浮短弧；Origin 已有松散丝缕感（参考图 1 左侧个体），随成长凝成可分辨的碎轨。
  if (seed >= 0.84) {
    vec3 arc = brokenArcAnchor(seed, time, g);
    float arcMix = 0.10 + 0.85 * smoothstep(0.08, 0.95, g);
    q = mix(q, arc, arcMix);
  }
  // 飘带化：Origin/Awaken 把近球形云剪切成流动丝带——差速旋绕卷出螺旋飘带、
  // 压扁拉长给出丝带截面、大尺度波瓣与细带分层制造缺口和卷尾（参考最早实拍 sheet.jpg）。
  // 成熟期淡出，让位给环轨/脉络结构。
  float ribbon = 1.0 - smoothstep(0.25, 0.95, g);
  if (ribbon > 0.001) {
    float ra = length(q.xz);
    float twist = ribbon * (1.2 * ra + 0.5 * q.y) * (0.85 + 0.15 * sin(time * 0.037));
    float cs = cos(twist);
    float sn = sin(twist);
    q = vec3(q.x * cs - q.z * sn, q.y, q.x * sn + q.z * cs);
    q.y = q.y * (1.0 - 0.45 * ribbon);
    q.x = q.x * (1.0 + 0.40 * ribbon);
    float la = atan(q.z, q.x);
    float lr = length(q.xz);
    float lobe = 1.0 + ribbon * (0.38 * sin(la * 2.0 + time * 0.07)
               + 0.22 * sin(la * 3.0 - time * 0.05)
               + 0.14 * sin(la * 5.0 + q.y * 3.0 + time * 0.11));
    q = vec3(q.x * lobe, q.y, q.z * lobe);
    q.y = q.y + ribbon * 0.15 * sin(lr * 4.0 - time * 0.09 + la * 2.0);
  }
  // 呼吸与轻微抽动分布在不同区域，交由力场追随，不瞬移粒子。
  vec3 drift = vec3(sin(q.y * 3.2 + time * 0.43), sin(q.z * 4.1 - time * 0.31), cos(q.x * 3.7 + time * 0.29));
  q += drift * (0.012 + 0.025 * (1.0 - g) + release * 0.06);
  float breath = sin(time * 0.81 + q.y * 2.4) + 0.45 * sin(time * 0.33 + q.x * 3.1);
  q *= 1.0 + breath * 0.025;
  return q;
}

`;

export const HOLOGRAM_WGSL = HOLOGRAM_GLSL
  .replace(/vec3 (\w+)\(float seed, float time, float growth\)/g, 'fn $1(seed: f32, time: f32, growth: f32) -> vec3f')
  .replace(/\b(float|vec3) (\w+) =/g, (_, type: string, name: string) => `var ${name}: ${type === 'float' ? 'f32' : 'vec3f'} =`)
  .replace(/\bvec3\(/g, 'vec3f(')
  // GLSL 的双参数 atan 对应 WGSL atan2。
  .replace('atan(q.z, q.x)', 'atan2(q.z, q.x)');


/** 局部信号沿种子相位传播，避免所有节点同时闪成白球。 */
export const HOLOGRAM_SIGNAL_GLSL = `
float hologramSignal(float seed, float time, float growth) {
  float lane = floor(hash1(seed * 19.7 + 0.4) * 24.0);
  float phase = hash1(seed * 13.7);
  float signal = pow(max(0.0, sin(time * 1.7 - phase * 8.0 + lane * 2.1)), 12.0);
  return 0.86 + signal * smoothstep(0.30, 0.88, growth) * 0.75;
}
`;
export const HOLOGRAM_SIGNAL_WGSL = HOLOGRAM_SIGNAL_GLSL
  .replace('float hologramSignal(float seed, float time, float growth)', 'fn hologramSignal(seed: f32, time: f32, growth: f32) -> f32')
  .replace(/float (\w+) =/g, 'let $1 =');

/** 节点共享传播相位；注意扇区点亮，形成有停顿的局部信号，而非整团均匀闪烁。 */
export const ATTENTION_SIGNAL_GLSL = `
float attentionSignal(float seed, float phase, float focus, float attention, float pulse) {
  float node = floor(hash1(seed * 19.7 + 0.4) * 24.0);
  float scan = pow(0.5 + 0.5 * cos(node * 2.3999632 - focus), 6.0);
  float travel = pow(max(0.0, sin(phase * 6.2831853 - node * 0.67 - hash1(seed * 13.7) * 2.0)), 8.0);
  float neural = smoothstep(0.14, 0.18, seed) * (1.0 - smoothstep(0.32, 0.36, seed));
  return mix(0.72, 0.25 + scan * attention * 1.5 + travel * (1.2 + pulse * 1.2), neural);
}
`;
export const ATTENTION_SIGNAL_WGSL = ATTENTION_SIGNAL_GLSL
  .replace('float attentionSignal(float seed, float phase, float focus, float attention, float pulse)', 'fn attentionSignal(seed: f32, phase: f32, focus: f32, attention: f32, pulse: f32) -> f32')
  .replace(/float (\w+) =/g, 'let $1 =');
