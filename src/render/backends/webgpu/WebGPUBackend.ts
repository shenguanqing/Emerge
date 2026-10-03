import { HOLOGRAM_WGSL, HOLOGRAM_SIGNAL_WGSL, ATTENTION_SIGNAL_WGSL } from '../../HologramField';
import { BODY_BASE_RADIUS, MAX_PARTICLES, type LifeParams, type LifeState, type SimulationParams } from '../../../core/types';
import { createParticleInitData } from '../particleInit';
import { DEFAULT_CAMERA, viewMatrix, type OrbitCamera } from '../../ViewState';

/**
 * WebGPU 后端：Compute 着色器做位置/速度积分（storage buffer ping-pong），
 * 自定义渲染管线以三角形带逐实例展开点精灵。
 * 力语义与 WebGL2 后端保持一致（见 core/types.ts SimulationParams 注释）。
 */

const COMPUTE_WGSL = /* wgsl */ `
struct Sim {
  data0: vec4f,          // dt, time, breath, damping
  core_shellK: vec4f,    // core.xyz, shellK
  data2: vec4f,          // coreG, curlStrength, curlFreq, curlSpeed
  data3: vec4f,          // count, thoughtPulse, structureTime, pad
  data4: vec4f,          // formMix, breathWave, revealT, revealSeconds
  data5: vec4f,          // bodyBase, swirlBase, musicBass, musicTreble
  pointerPos_act: vec4f, // pointer.xyz, active(0..1)
  pointerVel_pad: vec4f, // pointerVel.xyz, pad
  data6: vec4f,          // pointerRadius, pointerPush, impactSpeed, impactPush
  data7: vec4f,          // scatter, wary, contract, energy
  data8: vec4f,          // pointerPushMul, pulseBoost, press, pad
  data9: vec4f,          // pressStrength, pad, pad, pad
  clickPos_pulse: vec4f, // click.xyz, clickPulse
  data10: vec4f,         // symmetry, coreGlow, neural, fragment
  data11: vec4f,         // growth, streamArc, pulse, depthFade
  cognition: vec4f,      // focus angle, attention, thought phase, contemplation
};

@group(0) @binding(0) var<storage, read> posIn: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> posOut: array<vec4f>;
@group(0) @binding(2) var<storage, read> velIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velOut: array<vec4f>;
@group(0) @binding(4) var<uniform> sim: Sim;

fn hash1(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

// 有机形体半径：随方向低频起伏的非对称轮廓（与 WebGL2 后端保持一致）。
fn bodyRadius(dir: vec3f, symmetry: f32) -> f32 {
  var r = 1.0;
  r = r + 0.24 * sin(2.3 * dir.x + 1.7) * cos(1.9 * dir.y - 0.6);
  r = r + 0.17 * sin(3.1 * dir.z + 4.0);
  r = r + 0.11 * sin(4.7 * dir.x + 2.0) * sin(3.9 * dir.y + 1.0);
  r = r + 0.09 * sin(6.1 * dir.x + 3.7) * cos(5.7 * dir.z - 1.1);
  r = r + 0.07 * sin(2.9 * dir.x + 2.9 * dir.z + 0.5);
  return mix(r, 1.0, symmetry * 0.6);
}

// --- Simplex Noise 3D（Ashima Arts / Ian McEwan，公有领域实现，与 GLSL 数值一致） ---
fn mod289_3(xv: vec3f) -> vec3f { return xv - floor(xv * (1.0 / 289.0)) * 289.0; }
fn mod289_4(xv: vec4f) -> vec4f { return xv - floor(xv * (1.0 / 289.0)) * 289.0; }
fn permute4(xv: vec4f) -> vec4f { return mod289_4(((xv * 34.0) + 1.0) * xv); }
fn taylorInvSqrt4(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }

fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var iv = floor(v + dot(v, vec3f(C.y)));
  let x0 = v - iv + dot(iv, vec3f(C.x));
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + vec3f(C.x);
  let x2 = x0 - i2 + vec3f(C.y);
  let x3 = x0 - vec3f(D.y);
  iv = mod289_3(iv);
  let p = permute4(permute4(permute4(
      iv.z + vec4f(0.0, i1.z, i2.z, 1.0))
    + iv.y + vec4f(0.0, i1.y, i2.y, 1.0))
    + iv.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let nf = 0.142857142857;
  let ns = nf * vec3f(D.w, D.y, D.z) - vec3f(D.x, D.z, D.x);
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let xm = floor(j * ns.z);
  let ym = floor(j - 7.0 * xm);
  let xr = xm * ns.x + vec4f(ns.y);
  let yr = ym * ns.x + vec4f(ns.y);
  let hv = 1.0 - abs(xr) - abs(yr);
  let b0 = vec4f(xr.xy, yr.xy);
  let b1 = vec4f(xr.zw, yr.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(hv, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  let p0 = vec3f(a0.xy, hv.x);
  let p1 = vec3f(a0.zw, hv.y);
  let p2 = vec3f(a1.xy, hv.z);
  let p3 = vec3f(a1.zw, hv.w);
  let norm = taylorInvSqrt4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  let p0n = p0 * norm.x;
  let p1n = p1 * norm.y;
  let p2n = p2 * norm.z;
  let p3n = p3 * norm.w;
  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0n, x0), dot(p1n, x1), dot(p2n, x2), dot(p3n, x3)));
}

// 向量势取同一标量场的三个固定偏移，中心差分求旋度（18 次采样）。
fn curlNoise(pt: vec3f) -> vec3f {
  let o1 = vec3f(31.416, -47.853, 12.793);
  let o2 = vec3f(-233.145, 88.256, -137.317);
  let e = 0.35;
  let dx = vec3f(e, 0.0, 0.0);
  let dy = vec3f(0.0, e, 0.0);
  let dz = vec3f(0.0, 0.0, e);
  let ax = vec3f(snoise(pt + dx), snoise(pt + dx + o1), snoise(pt + dx + o2));
  let bx = vec3f(snoise(pt - dx), snoise(pt - dx + o1), snoise(pt - dx + o2));
  let ay = vec3f(snoise(pt + dy), snoise(pt + dy + o1), snoise(pt + dy + o2));
  let by = vec3f(snoise(pt - dy), snoise(pt - dy + o1), snoise(pt - dy + o2));
  let az = vec3f(snoise(pt + dz), snoise(pt + dz + o1), snoise(pt + dz + o2));
  let bz = vec3f(snoise(pt - dz), snoise(pt - dz + o1), snoise(pt - dz + o2));
  let dpx = (ax - bx) / (2.0 * e);
  let dpy = (ay - by) / (2.0 * e);
  let dpz = (az - bz) / (2.0 * e);
  return vec3f(dpz.y - dpy.z, dpx.z - dpz.x, dpy.x - dpx.y);
}

${HOLOGRAM_WGSL}
@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let count = u32(sim.data3.x);
  if (i >= count) { return; }

  let p4 = posIn[i];
  let v4 = velIn[i];
  let p = p4.xyz;
  let seed = p4.w;
  var v = v4.xyz;

  let dt = sim.data0.x;
  let time = sim.data0.y;
  let breath = sim.data0.z;
  let damping = sim.data0.w;
  let core = sim.core_shellK.xyz;
  let shellK = sim.core_shellK.w;
  let coreG = sim.data2.x;
  let curlStrength = sim.data2.y;
  let curlFreq = sim.data2.z;
  let curlSpeed = sim.data2.w;
  let bodyBase = sim.data5.x;
  let sizeN = bodyBase / ${BODY_BASE_RADIUS};
  let swirlBase = sim.data5.y;
  let formMix = sim.data4.x;
  let breathWave = sim.data4.y;

  // 层级：0 核心/内旋涡(<0.16) / 1 身体(轨道/神经/膜) / 2 外围碎片与弧流(>=0.84)。
  let layer = select(select(2.0, 1.0, seed < 0.84), 0.0, seed < 0.16);
  let h = hash1(seed * 41.53 + 0.37);

  // 个体方向：由种子确定的固定方向。
  let a1 = hash1(seed * 17.31 + 0.13) * 6.2831853;
  let a2 = hash1(seed * 29.17 + 0.71) * 2.0 - 1.0;
  let s2 = sqrt(max(1.0 - a2 * a2, 0.0));
  let dir = vec3f(cos(a1) * s2, sin(a1) * s2, a2);

  let contractMul = 1.0 - 0.12 * sim.data7.z;
  var anchor = hologramAnchor(seed, sim.data3.z, sim.data11.x, sim.data11.y) * bodyBase * breath * contractMul;

  let aim = vec3f(cos(sim.cognition.x), sin(sim.cognition.x), 0.0);
  let directed = smoothstep(0.1, 0.9, dot(normalize(anchor + vec3f(0.00001)), aim));
  let attentionMobility = select(1.0, 0.15, seed < 0.07);
  anchor += aim * bodyBase * sim.cognition.y * directed * 0.18 * attentionMobility;
  // 成熟思绪只短暂展开朝向关注点的身体脉络，保留核的稳定位置。
  let thoughtBody = select(0.0, 1.0, seed >= 0.16 && seed < 0.74);
  anchor += aim * bodyBase * sim.data3.y * smoothstep(0.55, 0.90, sim.data11.x)
          * directed * thoughtBody * 0.035;
  anchor *= 1.0 - sim.cognition.w * 0.06;
  var stiffMul = 0.55;
  if (layer < 0.5) { stiffMul = 3.2; }
  if (layer > 0.5 && layer < 1.5) { stiffMul = 1.0; }

  // 受惊散开：身体/外围刚度暂时软化（核心软化更少，保持可辨）。
  var softMul = mix(1.0, 0.15, sim.data7.x);
  if (layer < 0.5) { softMul = mix(1.0, 0.6, sim.data7.x); }
  let musicBass = sim.data5.z;
  let musicTreble = sim.data5.w;
  let pulseBoost = sim.data8.y;
  // 音乐时外壳略软，便于涨落；静音不改形态。
  let musicPush = max(0.0, musicBass - 0.03) + max(0.0, pulseBoost - 0.05) * 0.5;
  softMul *= (1.0 - 0.28 * musicPush);
  let goal = core + anchor;
  var force = (goal - p) * (shellK * (5.0 + 7.0 * sim.data11.x) * stiffMul * softMul);

  // 核心长程吸引。
  let toCore = core - p;
  let dist = length(toCore) + 0.25 * sizeN;
  force = force + (toCore / dist) * (coreG * 0.1 * sizeN * sizeN / dist);

  // 凝聚期旋涡：绕竖轴的切向力，离核越远越强，随成形衰减消失。
  let swirl = max(1.0 - formMix, sim.data7.x * 0.85) * swirlBase;
  let tangent = normalize(cross(vec3f(0.0, 1.0, 0.0), toCore) + vec3f(1e-5, 0.0, 0.0));
  force = force + tangent * swirl * sizeN * 0.15 * smoothstep(5.0, 0.5, dist);

  // ---- 音乐动作：幅度随团大小缩放 ----
  let fromCore = -toCore;
  let dCore = length(fromCore) + 1e-4;
  let outward = fromCore / dCore;

  force = force + outward * (musicBass * 7.5 * sizeN) * (0.35 + 0.65 * (layer / 2.0));
  force = force + outward * (pulseBoost * 9.0 * sizeN) * (0.5 + 0.5 * (layer / 2.0));
  let flowPos2 = p * (curlFreq * 1.6) + vec3f(time * 0.2, time * 0.13, time * (curlSpeed + musicTreble * 0.35));
  var trebleMul = 0.25;
  if (layer > 0.5 && layer < 1.5) { trebleMul = 0.8; }
  if (layer > 1.5) { trebleMul = 1.8; }
  force = force + curlNoise(flowPos2) * (musicTreble * 3.2 * trebleMul * sizeN);
  force = force + tangent * (sim.data7.w * 0.16 * sizeN) * smoothstep(4.5, 0.4, dist);

  // Curl Noise 流场：散度为零，长时间运动不散架、不固定循环；外围更活跃。
  let flowPos = p * curlFreq + vec3f(0.0, 0.0, time * curlSpeed * (1.0 + 1.2 * sim.data8.y));
  var curlMul = 1.5;
  if (layer < 0.5) { curlMul = 0.3; }
  if (layer > 0.5 && layer < 1.5) { curlMul = 1.0; }
  force = force + curlNoise(flowPos) * (curlStrength * (0.55 + 0.9 * sim.data7.w) * (1.0 + 0.7 * sim.data8.y) * curlMul * sizeN * 0.10 * (1.0 - sim.cognition.w * 0.8));

  // 指针力场：物理存在（温和排斥）+ 高速冲击（冲击波 + 拖拽尾迹）。
  if (sim.pointerPos_act.w > 0.01) {
    let toP = sim.pointerPos_act.xyz - p;
    let dP = length(toP) + 1e-4;
    let influence = smoothstep(sim.data6.x * sizeN, 0.0, dP);
    let away = -toP / dP;
    let speed = length(sim.pointerVel_pad.xyz);
    let impact = smoothstep(sim.data6.z, sim.data6.z * 2.5, speed) * influence;
    let waryMul = 1.0 + sim.data7.y * 0.6;
    let pushMul = influence * sim.data6.y * sim.data8.x * waryMul * (1.0 - sim.data8.z);
    force = force + away * (pushMul + impact * sim.data6.w * 3.0) * sizeN;
    force = force + sim.pointerVel_pad.xyz * impact * 0.9 * sizeN;
  }

  // 长按吸引场：粒子围向按压点（交互把玩）。
  if (sim.data8.z > 0.01) {
    let toPress = sim.pointerPos_act.xyz - p;
    let dPress = length(toPress) + 1e-4;
    let pin = smoothstep((sim.data6.x + 0.6) * sizeN, 0.0, dPress);
    force = force + (toPress / dPress) * (sim.data8.z * sim.data9.x * pin * sizeN);
  }

  // 点击涟漪：从点击点向外的单次冲击波。
  let dcl = length(p - sim.clickPos_pulse.xyz) + 1e-4;
  force = force + ((p - sim.clickPos_pulse.xyz) / dcl) * (smoothstep(2.4 * sizeN, 0.0, dcl) * sim.clickPos_pulse.w * 26.0 * sizeN);

  // 外围回收场：超出当前形态包络后渐进收拢，缩小设置也约束驱散。
  let envelope = max(bodyBase * 2.6 * breath, length(anchor) + bodyBase * 0.6);
  let excess = max(0.0, dCore - envelope);
  force = force - outward * excess * shellK * 4.0;
  force = force - v * smoothstep(0.0, max(bodyBase, 0.01), excess) * 6.0;

  // 半隐式欧拉 + 指数阻尼；dt 由 CPU 侧钳制。
  v = (v + force * dt) * exp(-(damping + 3.0) * dt);
  let np = p + v * dt;

  posOut[i] = vec4f(np, seed);
  velOut[i] = vec4f(v, v4.w);
}
`;

const RENDER_WGSL = /* wgsl */ `
struct R {
  vp: mat4x4f,
  data: vec4f,           // pointSizePx, viewportW, viewportH, unused
  data2: vec4f,          // formMix, breathWave, revealT, revealSeconds
  data3: vec4f,          // moodShift, pulseBoost, energy, time
  data4: vec4f,          // brightness, growth, pad, pad
  colCore: vec4f,
  colBody: vec4f,
  colAura: vec4f,
};

@group(0) @binding(0) var<storage, read> pos: array<vec4f>;
@group(0) @binding(1) var<uniform> r: R;



struct VOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) layer: f32,
  @location(2) alpha: f32,
  @location(3) @interpolate(flat) sat: f32,
  @location(4) glowBoost: f32,
  @location(5) axis: vec2f,
  @location(6) @interpolate(flat) filament: f32,
  @location(7) depthFade: f32,
  @location(8) streamGlow: f32,
};

${HOLOGRAM_SIGNAL_WGSL}
${ATTENTION_SIGNAL_WGSL}
@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let p4 = pos[ii];
  let seed = p4.w;
  let layer = select(select(2.0, 1.0, seed < 0.84), 0.0, seed < 0.16);
  let coreGlow = 0.28 + 0.72 * r.data4.y;
  let neural = smoothstep(0.10, 0.78, r.data4.y);
  let spoke = smoothstep(0.20, 0.50, r.data4.y) * (1.0 - 0.55 * smoothstep(0.78, 1.00, r.data4.y));
  let streamArc = smoothstep(0.72, 0.98, r.data4.y);
  let isNeural = select(0.0, 1.0, seed >= 0.16 && seed < 0.34);
  let isVolume = select(0.0, 1.0, seed >= 0.58 && seed < 0.66);
  let isSpoke = select(0.0, 1.0, seed >= 0.66 && seed < 0.74);
  let isArc = select(0.0, 1.0, seed >= 0.90);
  let isFrag = select(0.0, 1.0, seed >= 0.84 && seed < 0.90);
  // 脉络末端趋亮：复用组织场实际路径坐标，亮节点与空间位置对应。
  let along = pathwayPosition(seed);

  let clip = r.vp * vec4f(p4.xyz, 1.0);
  let depthFade = clamp(2.5 / max(clip.w, 0.001), 0.2, 2.0);

  // 逐个显现：t0 = seed × revealSeconds，0.8 秒平滑淡入。
  let t0 = seed * r.data2.w;
  var reveal = clamp((r.data2.z - t0) / 0.8, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  var sizeMul = 0.9;
  if (layer < 0.5) { sizeMul = 1.15; }
  if (layer > 0.5 && layer < 1.5) { sizeMul = 1.0; }
  sizeMul = sizeMul * mix(1.35, 1.0, r.data2.x);
  // 能量闪烁：高能量时粒子明暗呼吸式抖动（每粒子相位不同）。
  let tw = sin(r.data3.w * (2.5 + p4.w * 3.5) + p4.w * 40.0);
  sizeMul = sizeMul * (1.0 + r.data3.y * 0.15 + r.data3.z * 0.12 * tw);
  if (layer < 0.5) { sizeMul = sizeMul * (1.0 + coreGlow * 0.12); }
  sizeMul = sizeMul * (1.0 + isArc * streamArc * 0.25);
  sizeMul = sizeMul * (1.0 + isSpoke * spoke * along * 0.18);
  sizeMul = sizeMul * (1.0 + isVolume * 0.12);
  sizeMul = sizeMul * (1.0 + select(0.0, 0.18 * r.data4.y, seed >= 0.34 && seed < 0.58));
  sizeMul = sizeMul * (1.0 + select(0.0, 0.08, seed < 0.07));
  // 逐粒子大小差异：大点软芯、小点尘埃，避免均匀颗粒（与 WebGL2 同式）。
  sizeMul = sizeMul * (0.80 + 0.55 * hash1(seed * 57.3));
  // 身体与回流中约 35% 粒子沿真实速度拉成细丝，内部组织束保留细颗粒。
  let velocity = velIn[ii].xyz;
  let motion = smoothstep(0.02, 0.35, length(velocity));
  let filamentSeed = select(0.0, 1.0, ((seed >= 0.16 && seed < 0.84) || seed >= 0.90)
                                  && isVolume < 0.5 && hash1(seed * 151.7) > 0.65);
  let filament = filamentSeed * motion;
  let ahead = r.vp * vec4f(p4.xyz + velocity * 0.04, 1.0);
  let axis = normalize(ahead.xy / max(ahead.w, 0.001) - clip.xy / max(clip.w, 0.001) + vec2f(0.000001, 0.0));
  let pointPx = r.data.x * depthFade * sizeMul * mix(1.0, mix(1.5, 3.0, motion), filament);
  let halfNdc = corner * (pointPx / vec2f(r.data.y, r.data.z));

  var result: VOut;
  result.position = vec4f(clip.xy + halfNdc * clip.w, clip.z, clip.w);
  result.uv = corner;
  result.axis = axis;
  result.filament = filament;
  result.depthFade = depthFade;
  result.layer = layer;
  result.streamGlow = isArc * streamArc;
  result.alpha = reveal * mix(0.7, 1.0, r.data2.x) * (1.0 + r.data3.z * 0.2 * tw) * (1.0 - isFrag * 0.50) * mix(0.42, 0.62, filament) * select(1.0, select(0.38, 0.90, seed < 0.07), layer < 0.5);
  result.alpha *= 1.0 + isVolume * 0.45;
  result.alpha *= hologramExposure(seed, r.data4.y);
  // 火花明暗：逐粒子固定亮度差叠加闪烁，避免均匀光斑（与 WebGL2 后端一致）。
  result.glowBoost = (0.70 + 0.60 * hash1(p4.w * 91.7 + 2.1))
                   * (1.0 + r.data3.y * 0.18 + r.data3.z * 0.14 * tw)
                   * (1.0 + isNeural * neural * 0.55 + isSpoke * spoke * (0.30 + 0.50 * along) + isArc * streamArc * 0.4)
                   * (1.0 + select(0.0, coreGlow * 0.08, layer < 0.5));
  result.glowBoost *= hologramSignal(seed, r.data3.w, r.data4.y);
  result.glowBoost *= attentionSignal(seed, r.colCore.w, r.data.w, r.data4.w, r.colAura.w, r.data4.y);
  // 卫星标记：远轨亮金大粒子（与 WebGL2 一致）。
  result.sat = select(0.0, 1.0, r.data4.y > 0.7 && seed >= 0.995);
  return result;
}

@fragment
fn fs(vin: VOut) -> @location(0) vec4f {
  let axis = normalize(vin.axis + vec2f(0.000001, 0.0));
  let oriented = vec2f(dot(vin.uv, axis), dot(vin.uv, vec2f(-axis.y, axis.x)));
  let d = length(oriented * vec2f(1.0, mix(1.0, 5.0, vin.filament)));
  // 火花剖面：边缘收紧、裙摆压暗，与白热芯一起构成高对比颗粒。
  let s = smoothstep(1.0, 0.32, d);
  if (d > 1.0) { discard; }
  var a = 0.06 + 0.94 * s;
  let hot = smoothstep(0.50, 0.05, d); // 白热火花芯

  // 分层配色：主题色 + 情绪微偏；呼吸提亮核心。
  let breathWave = r.data2.y;
  let coreCol = mix(r.colCore.xyz, r.colCore.xyz * vec3f(1.0, 0.97, 0.92), r.data3.x * 0.35)
              * (0.72 + 0.18 * breathWave);
  let bodyCol = mix(r.colBody.xyz, r.colBody.xyz * vec3f(1.0, 1.12, 1.18), r.data3.x * 0.25) * 1.55;
  let auraCol = r.colAura.xyz * (0.9 + r.data4.z * 0.85);
  var col = auraCol;
  var layerAlpha = 0.55 + r.data4.z * 0.25;
  if (vin.layer < 0.5) { col = coreCol; layerAlpha = 0.72; }
  if (vin.layer > 0.5 && vin.layer < 1.5) { col = bodyCol; layerAlpha = 0.85; }
  // 成熟回流逐步取得身体的材质密度；外围碎片保留稀疏暗底。
  col = mix(col, mix(auraCol, bodyCol, 0.8), vin.streamGlow);
  layerAlpha = mix(layerAlpha, 0.78, vin.streamGlow);
  let depthFade = vin.depthFade;
  var glow = mix(col, mix(r.colCore.xyz, vec3f(1.0), 0.20), hot * 0.06) // 火花芯烧白
           * (0.85 + 0.15 * depthFade) * sqrt(max(r.data4.x, 0.0)) * 1.15 * vin.glowBoost;
  glow = mix(glow, mix(r.colCore.xyz, vec3f(1.0), 0.28), vin.sat * 0.55); // 卫星粒子亮金白
  return vec4f(glow * a, a * vin.alpha * layerAlpha);
}
`;

/** WebGPU 透视投影（clip z ∈ [0,1]），列主序。 */
function perspectiveWebGPU(
  fovY: number, aspect: number, near: number, far: number,
): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}

/** 列主序 4×4 乘法 a·b。 */
function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export class WebGPUBackend {
  readonly id = 'webgpu' as const;
  particleCount: number;

  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly posBuf: [GPUBuffer, GPUBuffer];
  private readonly velBuf: [GPUBuffer, GPUBuffer];
  private readonly simUniform: GPUBuffer;
  private readonly renderUniform: GPUBuffer;
  private readonly computePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly computeBinds: [GPUBindGroup, GPUBindGroup];
  private readonly renderBinds: [GPUBindGroup, GPUBindGroup];
  /** [0..15] VP；[16..19] pointSizePx, viewportW, viewportH, unused；[20..23] formMix, breathWave, revealT, revealSeconds；[24..27] moodShift, pulseBoost, energy, time。 */
  private readonly renderData = new Float32Array(44);
  private readonly simData = new Float32Array(64);
  private pointSize: number;
  private dpr = 1;
  private clearAlpha = 1;
  private readIdx = 0;
  private disposed = false;
  private framePending = false;
  private failed = false;
  private view: OrbitCamera = { ...DEFAULT_CAMERA };

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    canvas: HTMLCanvasElement,
    private readonly params: LifeParams,
    private readonly sim: SimulationParams,
  ) {
    this.device = device;
    this.context = context;
    this.canvas = canvas;
    this.particleCount = params.particleCount;
    this.pointSize = params.pointSize;

    const init = createParticleInitData(MAX_PARTICLES);
    const bufSize = MAX_PARTICLES * 16;
    const makeBuf = (data: Float32Array): GPUBuffer => {
      const buf = device.createBuffer({
        size: bufSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(buf, 0, data);
      return buf;
    };
    this.posBuf = [makeBuf(init.positions), makeBuf(init.positions)];
    this.velBuf = [makeBuf(init.velocities), makeBuf(init.velocities)];

    this.simUniform = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniform = device.createBuffer({
      size: 176,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = device.createShaderModule({ code: COMPUTE_WGSL + RENDER_WGSL });
    this.computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'cs' },
    });
    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });

    const mkComputeBind = (read: 0 | 1): GPUBindGroup =>
      device.createBindGroup({
        layout: this.computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.posBuf[read] } },
          { binding: 1, resource: { buffer: this.posBuf[1 - read] } },
          { binding: 2, resource: { buffer: this.velBuf[read] } },
          { binding: 3, resource: { buffer: this.velBuf[1 - read] } },
          { binding: 4, resource: { buffer: this.simUniform } },
        ],
      });
    this.computeBinds = [mkComputeBind(0), mkComputeBind(1)];

    const mkRenderBind = (read: 0 | 1): GPUBindGroup =>
      device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.posBuf[read] } },
          { binding: 1, resource: { buffer: this.renderUniform } },
          { binding: 2, resource: { buffer: this.velBuf[read] } },
        ],
      });
    this.renderBinds = [mkRenderBind(0), mkRenderBind(1)];

    this.updateCameraUniform();
    // 默认金色，设置面板 setVisual 可覆盖。
    this.renderData[32] = 1.0;
    this.renderData[33] = 0.95;
    this.renderData[34] = 0.82;
    this.renderData[35] = 1;
    this.renderData[36] = 0.88;
    this.renderData[37] = 0.68;
    this.renderData[38] = 0.32;
    this.renderData[39] = 1;
    this.renderData[40] = 0.58;
    this.renderData[41] = 0.42;
    this.renderData[42] = 0.18;
    this.renderData[43] = 1;

    void device.lost.then(() => {
      this.disposed = true;
    });
    // 未捕获的管线/着色器校验错误上抛到诊断通道，避免静默黑屏。
    device.onuncapturederror = (ev) => {
      this.failed = true;
      const w = window as typeof window & { __emergeErrors?: string[] };
      if (w.__emergeErrors && w.__emergeErrors.length < 20) w.__emergeErrors.push(`GPU: ${ev.error.message.slice(0, 300)}`);
    };
  }

  /** 探测并创建后端；任何失败返回 null（上层回退 WebGL2）。 */
  static async create(
    canvas: HTMLCanvasElement,
    params: LifeParams,
    sim: SimulationParams,
    transparent = false,
  ): Promise<WebGPUBackend | null> {
    try {
      if (!navigator.gpu) return null;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu');
      if (!context) return null;
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: transparent ? 'premultiplied' : 'opaque',
      });
      device.pushErrorScope('validation');
      const backend = new WebGPUBackend(device, context, format, canvas, params, sim);
      const validation = await device.popErrorScope();
      if (validation) {
        console.warn('[WebGPU]', validation.message);
        backend.dispose();
        context.unconfigure();
        device.destroy();
        return null;
      }
      backend.clearAlpha = transparent ? 0 : 1;
      return backend;
    } catch {
      return null;
    }
  }

  private updateCameraUniform(): void {
    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const proj = perspectiveWebGPU((50 * Math.PI) / 180, aspect, 0.1, 100);
    this.renderData.set(mat4Multiply(proj, viewMatrix(this.view)), 0);
  }

  /** 观察空间相机：球坐标环绕原点。 */
  setView(view: OrbitCamera): void {
    this.view = { ...view };
    this.updateCameraUniform();
  }

  getView(): OrbitCamera {
    return { ...this.view };
  }

  /** 每帧执行一次 Compute 步进并渲染。 */
  frame(state: LifeState, dt: number): void {
    if (this.disposed || this.failed || this.framePending) return;
    const d = this.device;

    this.simData[0] = dt;
    this.simData[1] = state.time;
    this.simData[2] = state.breathScale;
    this.simData[3] = this.sim.damping;
    this.simData[4] = state.corePosition[0];
    this.simData[5] = state.corePosition[1];
    this.simData[6] = state.corePosition[2];
    this.simData[7] = this.sim.shellStiffness;
    this.simData[8] = this.sim.coreGravity;
    this.simData[9] = this.sim.curlStrength;
    this.simData[10] = this.sim.curlFrequency;
    this.simData[11] = this.sim.curlSpeed;
    this.simData[12] = this.particleCount;
    this.simData[13] = state.thoughtPulse;
    this.simData[14] = state.structureTime;
    this.simData.set([state.focusAngle, state.attention, state.thoughtPhase, state.contemplation], 60);
    this.simData[16] = state.formMix;
    this.simData[17] = state.breathWave;
    this.simData[20] = this.sim.bodyBase;
    this.simData[21] = this.sim.swirlBase;
    const musicOn = state.musicActive > 0.5 ? 1 : 0;
    this.simData[22] = state.musicBass * musicOn;
    this.simData[23] = state.musicTreble * musicOn;
    this.simData[24] = state.pointerPos[0];
    this.simData[25] = state.pointerPos[1];
    this.simData[26] = state.pointerPos[2];
    this.simData[27] = state.pointerActive;
    this.simData[28] = state.pointerVel[0];
    this.simData[29] = state.pointerVel[1];
    this.simData[30] = state.pointerVel[2];
    this.simData[32] = this.sim.pointerRadius;
    this.simData[33] = this.sim.pointerPush;
    this.simData[34] = this.sim.impactSpeed;
    this.simData[35] = this.sim.impactPush;
    this.simData[36] = state.scatter;
    this.simData[37] = state.wary;
    this.simData[38] = state.contract;
    this.simData[39] = state.energy;
    this.simData[40] = state.pointerPushMul;
    this.simData[41] = state.pulseBoost;
    this.simData[42] = state.pressRamp;
    this.simData[44] = this.sim.pressStrength;
    this.simData[52] = state.symmetry;
    this.simData[53] = state.form.coreGlow;
    this.simData[54] = state.form.neural;
    this.simData[55] = state.form.fragment;
    this.simData[56] = state.growth;
    this.simData[57] = state.form.streamArc;
    this.simData[58] = state.form.pulse;
    this.simData[59] = state.form.depthFade;
    this.simData[48] = state.clickPos[0];
    this.simData[49] = state.clickPos[1];
    this.simData[50] = state.clickPos[2];
    this.simData[51] = state.clickPulse;
    d.queue.writeBuffer(this.simUniform, 0, this.simData);

    this.renderData[20] = state.formMix;
    this.renderData[21] = state.breathWave;
    this.renderData[22] = state.revealT;
    this.renderData[23] = this.params.revealSeconds;
    this.renderData[24] = state.moodShift;
    this.renderData[25] = state.pulseBoost;
    this.renderData[26] = state.energy;
    this.renderData[27] = state.time;
    this.renderData[28] = state.brightness * this.brightnessScale * Math.min(1, Math.pow(this.sim.bodyBase / BODY_BASE_RADIUS, 1.8));
    this.renderData[29] = state.growth;
    this.renderData[30] = state.musicTreble;
    this.renderData[19] = state.focusAngle; this.renderData[31] = state.attention;
    this.renderData[35] = state.thoughtPhase; this.renderData[39] = state.contemplation; this.renderData[43] = state.thoughtPulse;
    // 主题色（setVisual 写入 renderData[32..43]）。
    d.queue.writeBuffer(this.renderUniform, 0, this.renderData);

    const read = this.readIdx;
    const write = (1 - read) as 0 | 1;
    const encoder = d.createCommandEncoder();

    const cpass = encoder.beginComputePass();
    cpass.setPipeline(this.computePipeline);
    cpass.setBindGroup(0, this.computeBinds[read]);
    cpass.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    cpass.end();

    const view = this.context.getCurrentTexture().createView();
    const rpass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: this.clearAlpha },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    rpass.setPipeline(this.renderPipeline);
    rpass.setBindGroup(0, this.renderBinds[write]);
    rpass.draw(4, this.particleCount);
    rpass.end();

    d.queue.submit([encoder.finish()]);
    this.readIdx = write;
    // RAF 只反映页面调度，不代表 GPU 已完成。最多保留一个未完成帧，
    // 防止 GPU 变慢时持续积压计算、绘制和 uniform 写入。
    this.framePending = true;
    void d.queue.onSubmittedWorkDone().then(() => {
      this.framePending = false;
    }, () => {
      this.failed = true;
      this.framePending = false;
    });
  }

  /** 质量档位：改变活跃粒子数（dispatch 与绘制数量）。 */
  setActiveCount(count: number): void {
    this.particleCount = Math.min(count, MAX_PARTICLES);
  }

  /** 质量档位：粒子基础尺寸；低于可读下限的点会闪烁成灰尘，钳到 1.35 逻辑像素。 */
  setPointSize(size: number): void {
    this.pointSize = Math.max(1.35, size);
    this.renderData[16] = this.pointSize * this.dpr;
  }

  /** 设置面板：团大小倍率 + 三层配色 + 亮度倍率。 */
  private brightnessScale = 1;

  setVisual(
    bodyScale: number,
    core: [number, number, number],
    body: [number, number, number],
    aura: [number, number, number],
    brightness = 1,
  ): void {
    this.sim.bodyBase = BODY_BASE_RADIUS * bodyScale;
    this.brightnessScale = brightness;
    this.renderData[32] = core[0];
    this.renderData[33] = core[1];
    this.renderData[34] = core[2];
    this.renderData[35] = 1;
    this.renderData[36] = body[0];
    this.renderData[37] = body[1];
    this.renderData[38] = body[2];
    this.renderData[39] = 1;
    this.renderData[40] = aura[0];
    this.renderData[41] = aura[1];
    this.renderData[42] = aura[2];
    this.renderData[43] = 1;
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.dpr = dpr;
    this.renderData[16] = this.pointSize * dpr;
    this.renderData[17] = this.canvas.width;
    this.renderData[18] = this.canvas.height;
    this.updateCameraUniform();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of [...this.posBuf, ...this.velBuf, this.simUniform, this.renderUniform]) {
      b.destroy();
    }
  }
}
