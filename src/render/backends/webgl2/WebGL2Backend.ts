import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { MAX_PARTICLES, type LifeParams, type LifeState, type SimulationParams } from '../../../core/types';
import { createParticleInitData } from '../particleInit';

/**
 * WebGL2 后端：Three.js 点渲染 + GPUComputationRenderer 做 GPGPU 模拟。
 * 位置/速度保存在浮点纹理中 ping-pong 双缓冲；力语义与 WebGPU 后端一致。
 * 若硬件不支持浮点渲染目标，自动降级 HalfFloat（精度略低但可运行）。
 * 注意：本环境（ANGLE）下 three 显式 GLSL3 材质有病理性性能问题，
 * 着色器统一采用 GLSL1 风格（texture2D/varying/gl_FragColor）。
 */

/** 模拟纹理宽度；高度 = ceil(count / 256)。 */
const SIM_W = 256;

/** 速度更新：有机形体锚点 + 分层刚度 + 凝聚旋涡 + 核心吸引 + 湍流。 */
const VEL_FRAG = /* glsl */ `
uniform float uDt;
uniform float uTime;
uniform float uBreath;
uniform float uBreathWave;
uniform float uFormMix;
uniform vec3 uCore;
uniform float uShellK;
uniform float uCoreG;
uniform float uDamping;
uniform float uCurlStrength;
uniform float uCurlFreq;
uniform float uCurlSpeed;
uniform float uBodyBase;
uniform float uSwirlBase;
uniform vec3 uPointerPos;
uniform vec3 uPointerVel;
uniform float uPointerActive;
uniform float uPointerRadius;
uniform float uPointerPush;
uniform float uImpactSpeed;
uniform float uImpactPush;
uniform float uScatter;
uniform float uWary;
uniform float uContract;
uniform float uEnergy;
uniform float uPulseBoost;
uniform float uSymmetry;
uniform float uRing;
uniform float uDual;
uniform float uArms;
uniform float uGrowth;
uniform vec3 uCore2Offset;
uniform float uPress;
uniform float uPressStrength;
uniform vec3 uClickPos;
uniform float uClickPulse;
uniform float uPointerPushMul;
uniform float uMusicBass;
uniform float uMusicTreble;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

// 有机形体半径：随方向低频起伏的非对称轮廓（与 WebGPU 后端保持一致）。
float bodyRadius(vec3 dir) {
  float r = 1.0;
  r += 0.24 * sin(2.3 * dir.x + 1.7) * cos(1.9 * dir.y - 0.6);
  r += 0.17 * sin(3.1 * dir.z + 4.0);
  r += 0.11 * sin(4.7 * dir.x + 2.0) * sin(3.9 * dir.y + 1.0);
  r += 0.09 * sin(6.1 * dir.x + 3.7) * cos(5.7 * dir.z - 1.1);
  r += 0.07 * sin(2.9 * dir.x + 2.9 * dir.z + 0.5);
  // DNA 对称度：越高形体越平滑对称。
  return mix(r, 1.0, uSymmetry * 0.6);
}

// --- Simplex Noise 3D（Ashima Arts / Ian McEwan，公有领域实现） ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// 向量势取同一标量场的三个固定偏移，中心差分求旋度（18 次采样）。
vec3 curlNoise(vec3 p) {
  vec3 o1 = vec3(31.416, -47.853, 12.793);
  vec3 o2 = vec3(-233.145, 88.256, -137.317);
  float e = 0.35;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 ax = vec3(snoise(p + dx), snoise(p + dx + o1), snoise(p + dx + o2));
  vec3 bx = vec3(snoise(p - dx), snoise(p - dx + o1), snoise(p - dx + o2));
  vec3 ay = vec3(snoise(p + dy), snoise(p + dy + o1), snoise(p + dy + o2));
  vec3 by = vec3(snoise(p - dy), snoise(p - dy + o1), snoise(p - dy + o2));
  vec3 az = vec3(snoise(p + dz), snoise(p + dz + o1), snoise(p + dz + o2));
  vec3 bz = vec3(snoise(p - dz), snoise(p - dz + o1), snoise(p - dz + o2));
  vec3 dpx = (ax - bx) / (2.0 * e);
  vec3 dpy = (ay - by) / (2.0 * e);
  vec3 dpz = (az - bz) / (2.0 * e);
  return vec3(dpz.y - dpy.z, dpx.z - dpz.x, dpy.x - dpx.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p4 = texture2D(texturePosition, uv);
  vec4 v4 = texture2D(textureVelocity, uv);
  vec3 p = p4.xyz;
  float seed = p4.w;
  vec3 v = v4.xyz;

  // 层级由种子确定：0 核心(12%) / 1 身体(74%) / 2 外围(14%)。
  float layer = seed < 0.12 ? 0.0 : (seed < 0.86 ? 1.0 : 2.0);
  float h = hash1(seed * 41.53 + 0.37);

  // 个体方向：由种子确定的固定方向。
  float a1 = hash1(seed * 17.31 + 0.13) * 6.2831853;
  float a2 = hash1(seed * 29.17 + 0.71) * 2.0 - 1.0;
  float s2 = sqrt(max(1.0 - a2 * a2, 0.0));
  vec3 dir = vec3(cos(a1) * s2, sin(a1) * s2, a2);

  // 分层锚点：核心致密内聚，身体贴合有机轮廓，外围松散且呼吸反相。
  // 受惊收缩：核心轻微收紧，身体明显收拢（由 BehaviorEngine 平滑驱动）。
  float contractMul = layer < 0.5 ? (1.0 - 0.12 * uContract) : (1.0 - 0.22 * uContract);
  float sizeN = uBodyBase / 0.85;
  float bodyR = bodyRadius(dir) * uBodyBase * uBreath * contractMul;
  float radMul = layer < 0.5 ? mix(0.24, 0.46, h)
               : layer < 1.5 ? mix(0.88, 1.04, h)
               : mix(1.22, 1.65, h) * (1.0 + 0.08 * (1.0 - uBreathWave));
  vec3 anchor = dir * bodyR * radMul;

  // 成长：行星环（更锐利的环面）。
  if (layer > 0.5 && layer < 1.5 && h >= 0.62 && h < 0.62 + uRing * 0.13) {
    anchor = dir * uBodyBase * 1.55 * uBreath;
    anchor.y *= 0.12;
  }
  // 成长：双星——桥接粒子串联两核，两核互绕把身体拉成双瓣。
  if (uDual > 0.5) {
    if (seed >= 0.12 && seed < 0.20) {
      anchor = uCore2Offset + anchor * 0.45;
    } else if (seed >= 0.20 && seed < 0.26) {
      float frac = (seed - 0.20) / 0.06;
      anchor = uCore2Offset * frac + dir * bodyR * 0.3 * radMul;
    }
  }
  // 成长：旋臂（触手状流苏，随成长伸长、缓慢旋转）。
  float armAlong = (h - 0.75) / 0.25;
  if (uArms >= 2.0 && layer > 0.5 && h >= 0.75) {
    float armIdx = floor(mod(seed * 97.0, uArms));
    float baseAngle = armIdx * 6.2831853 / uArms + uTime * 0.05;
    float angle = baseAngle + armAlong * 0.9 + seed * 0.3;
    float armRadius = uBodyBase * (0.8 + armAlong * 0.75);
    float yArm = (hash1(seed * 13.7) - 0.5) * armAlong * bodyR * 0.8;
    anchor = vec3(cos(angle) * armRadius, yArm, sin(angle) * armRadius);
  }
  // 成长：卫星粒子（远轨明亮大粒子，环绕母体）；轨道随团大小缩放。
  if (uGrowth > 0.7 && seed >= 0.995) {
    float ph = hash1(seed * 57.1) * 6.2831853;

    float orbR = (1.2 + hash1(seed * 77.7) * 0.25) * sizeN;
    anchor = vec3(
      cos(uTime * 0.18 + ph) * orbR,
      sin(uTime * 0.11 + ph * 2.0) * orbR * 0.3,
      sin(uTime * 0.18 + ph) * orbR * 0.55);
  }

  float stiffMul = layer < 0.5 ? 3.2 : (layer < 1.5 ? 1.0 : 0.55);
  // 受惊散开：身体/外围刚度暂时软化（核心软化更少，保持可辨）。
  float softMul = layer < 0.5 ? mix(1.0, 0.6, uScatter) : mix(1.0, 0.15, uScatter);
  // 音乐时外壳略软，便于涨落；静音不改形态。
  float musicPush = max(0.0, uMusicBass - 0.03) + max(0.0, uPulseBoost - 0.05) * 0.5;
  softMul *= (1.0 - 0.28 * musicPush);
  vec3 target = uCore + anchor;
  vec3 force = (target - p) * (uShellK * stiffMul * softMul);

  // 核心长程吸引。
  vec3 toCore = uCore - p;
  float dist = length(toCore) + 0.25 * sizeN;
  force += (toCore / dist) * (uCoreG * sizeN * sizeN / dist);

  // 旋涡：凝聚期与受惊重组期共用——粒子绕核回旋后自然归位。
  float swirl = max(1.0 - uFormMix, uScatter * 0.85) * uSwirlBase;
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), toCore) + vec3(1e-5, 0.0, 0.0));
  force += tangent * swirl * sizeN * smoothstep(5.0, 0.5, dist);

  // ---- 音乐动作：低频体积推、节拍炸开、高频搅动；幅度随团大小缩放 ----
  vec3 fromCore = -toCore;
  float dCore = length(fromCore) + 1e-4;
  vec3 outward = fromCore / dCore;

  // 低频：整团向外顶，像被鼓点吹开。
  force += outward * (uMusicBass * 7.5 * sizeN) * (0.35 + 0.65 * (layer / 2.0));
  // 节拍：一次性外推冲击（配合 pulseBoost 视觉闪光）。
  force += outward * (uPulseBoost * 9.0 * sizeN) * (0.5 + 0.5 * (layer / 2.0));
  // 高频：外围搅动，流场加速。
  vec3 flowPos2 = p * (uCurlFreq * 1.6) + vec3(uTime * 0.2, uTime * 0.13, uTime * (uCurlSpeed + uMusicTreble * 0.35));
  float trebleMul = layer > 1.5 ? 1.8 : (layer > 0.5 ? 0.8 : 0.25);
  force += curlNoise(flowPos2) * (uMusicTreble * 3.2 * trebleMul * sizeN);
  // 高能：旋涡加快一点，整团转起来。
  force += tangent * (uEnergy * 1.6 * sizeN) * smoothstep(4.5, 0.4, dist);

  // Curl Noise 流场：散度为零，长时间运动不散架、不固定循环；外围更活跃。
  vec3 flowPos = p * uCurlFreq + vec3(0.0, 0.0, uTime * uCurlSpeed);
  float curlMul = layer < 0.5 ? 0.3 : (layer < 1.5 ? 1.0 : 1.5);
  force += curlNoise(flowPos) * (uCurlStrength * (0.55 + 0.9 * uEnergy) * curlMul * sizeN);

  // 指针力场：物理存在（温和排斥）+ 高速冲击（冲击波 + 拖拽尾迹）。
  // 指针读数已经过感知延迟，此处只做纯力响应。
  if (uPointerActive > 0.01) {
    vec3 toP = uPointerPos - p;
    float dP = length(toP) + 1e-4;
    float influence = smoothstep(uPointerRadius * sizeN, 0.0, dP);
    vec3 away = -toP / dP;
    float speed = length(uPointerVel);
    float impact = smoothstep(uImpactSpeed, uImpactSpeed * 2.5, speed) * influence;
    // 警觉期：影响半径与排斥略增；长按时排斥淡出（把玩优先）。
    float waryMul = 1.0 + uWary * 0.6;
    float pushMul = influence * uPointerPush * uPointerPushMul * waryMul * (1.0 - uPress);
    force += away * (pushMul + impact * uImpactPush * 3.0) * sizeN;
    force += uPointerVel * impact * 0.9 * sizeN;
  }

  // 长按吸引场：粒子围向按压点（交互把玩）。
  if (uPress > 0.01) {
    vec3 toPress = uPointerPos - p;
    float dPress = length(toPress) + 1e-4;
    float pin = smoothstep((uPointerRadius + 0.6) * sizeN, 0.0, dPress);
    force += (toPress / dPress) * (uPress * uPressStrength * pin * sizeN);
  }

  // 点击涟漪：从点击点向外的单次冲击波。
  vec3 dc = p - uClickPos;
  float dcl = length(dc) + 1e-4;
  force += (dc / dcl) * (smoothstep(2.4 * sizeN, 0.0, dcl) * uClickPulse * 26.0 * sizeN);

  // 与 WebGPU 相同的外围回收场，使用力收拢而非瞬移截断。
  float envelope = max(uBodyBase * 2.6 * uBreath, length(anchor) + uBodyBase * 0.6);
  float excess = max(0.0, dCore - envelope);
  force -= outward * excess * uShellK * 4.0;
  force -= v * smoothstep(0.0, max(uBodyBase, 0.01), excess) * 6.0;

  // 半隐式欧拉 + 指数阻尼；dt 由 CPU 侧钳制。
  vec3 nv = (v + force * uDt) * exp(-uDamping * uDt);
  gl_FragColor = vec4(nv, v4.w);
}
`;

/** 位置更新：用最新速度积分。 */
const POS_FRAG = /* glsl */ `
uniform float uDt;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p4 = texture2D(texturePosition, uv);
  vec4 v4 = texture2D(textureVelocity, uv);
  vec3 p = p4.xyz + v4.xyz * uDt;
  gl_FragColor = vec4(p, p4.w);
}
`;

const POINTS_VERT = /* glsl */ `
uniform sampler2D uPosTex;
uniform vec2 uSimSize;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uRevealT;
uniform float uRevealSeconds;
uniform float uFormMix;
uniform float uTime;
uniform float uEnergy;
uniform float uPulseBoost;
uniform float uGrowth;
attribute float aRef;
varying float vGlow;
varying float vAlpha;
varying float vLayer;
varying float vSat;
varying float vSpark;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  float ref = aRef + 0.5;
  vec2 uv = vec2(mod(ref, uSimSize.x), floor(ref / uSimSize.x)) / uSimSize;
  vec4 p4 = texture2D(uPosTex, uv);
  vec3 p = p4.xyz;
  float seed = p4.w;
  float layer = seed < 0.12 ? 0.0 : (seed < 0.86 ? 1.0 : 2.0);
  float sat = uGrowth > 0.7 && seed >= 0.995 ? 1.0 : 0.0;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depthFade = clamp(2.5 / max(-mv.z, 0.001), 0.2, 2.0);

  // 逐个显现：t0 = seed × revealSeconds，0.8 秒平滑淡入。
  float t0 = seed * uRevealSeconds;
  float reveal = clamp((uRevealT - t0) / 0.8, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  float sizeMul = (layer < 0.5 ? 1.5 : (layer < 1.5 ? 1.0 : 0.9)) * mix(1.35, 1.0, uFormMix);
  // 能量闪烁：高能量时粒子明暗呼吸式抖动（每粒子相位不同，与 WebGPU 后端一致）。
  float tw = sin(uTime * (2.5 + seed * 3.5) + seed * 40.0);
  sizeMul *= (1.0 + uPulseBoost * 0.15 + uEnergy * 0.12 * tw);
  gl_PointSize = uPointSize * uPixelRatio * depthFade * sizeMul;
  vGlow = depthFade;
  vLayer = layer;
  vAlpha = reveal * mix(0.7, 1.0, uFormMix) * (1.0 + uEnergy * 0.2 * tw);
  // 火花明暗：逐粒子固定亮度差叠加闪烁，避免均匀光斑（与 WebGPU 后端一致）。
  vSpark = (0.70 + 0.60 * hash1(seed * 91.7 + 2.1))
         * (1.0 + uPulseBoost * 0.18 + uEnergy * 0.14 * tw);
}
`;

const POINTS_FRAG = /* glsl */ `
precision mediump float;
uniform float uBreathWave;
uniform float uMoodShift;
uniform float uBrightness;
uniform vec3 uCoreCol;
uniform vec3 uBodyCol;
uniform vec3 uAuraCol;
uniform float uTreble;
varying float vSat;
varying float vGlow;
varying float vAlpha;
varying float vLayer;
varying float vSpark;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;             // 0 中心 → 1 精灵边缘
  // 火花剖面：边缘收紧、裙摆压暗，与白热芯一起构成高对比颗粒。
  float s = smoothstep(1.0, 0.32, d);
  float a = 0.20 + 0.80 * s * s;
  float hot = smoothstep(0.50, 0.05, d);  // 白热火花芯

  // 分层配色：主题色 + 情绪微偏；呼吸提亮核心。
  vec3 coreCol = mix(uCoreCol, uCoreCol * vec3(1.0, 0.97, 0.92), uMoodShift * 0.35)
               * (1.20 + 0.60 * uBreathWave);
  vec3 bodyCol = mix(uBodyCol, uBodyCol * vec3(1.0, 1.12, 1.18), uMoodShift * 0.25) * 1.38;
  vec3 auraCol = uAuraCol * (0.9 + uTreble * 0.85);
  vec3 col = vLayer < 0.5 ? coreCol : (vLayer < 1.5 ? bodyCol : auraCol);
  float layerAlpha = vLayer < 0.5 ? 1.0 : (vLayer < 1.5 ? 0.85 : 0.55 + uTreble * 0.25);
  col = mix(col, vec3(1.0, 0.94, 0.78), hot * 0.50); // 火花芯烧白
  col *= (0.85 + 0.15 * vGlow) * uBrightness * vSpark;
  col = mix(col, vec3(1.0, 0.96, 0.82), vSat * 0.55); // 卫星粒子亮金白
  gl_FragColor = vec4(col * a, a * vAlpha * layerAlpha);
}
`;

type SimVariable = ReturnType<GPUComputationRenderer['addVariable']>;

export class WebGL2Backend {
  readonly id = 'webgl2' as const;
  particleCount: number;
  private readonly simH: number;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly gpu: GPUComputationRenderer;
  private readonly posVar: SimVariable;
  private readonly velVar: SimVariable;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly params: LifeParams,
    private readonly sim: SimulationParams,
    transparent = false,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: transparent,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, transparent ? 0 : 1);
    this.camera.position.set(0, 0, 7);
    this.particleCount = params.particleCount;
    this.simH = Math.ceil(MAX_PARTICLES / SIM_W);

    // 浮点渲染目标不可用时降级 HalfFloat，保持可用性。
    this.gpu = new GPUComputationRenderer(SIM_W, this.simH, this.renderer);
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      this.gpu.setDataType(THREE.HalfFloatType);
    }

    const init = createParticleInitData(MAX_PARTICLES);
    const pos0 = this.gpu.createTexture();
    const vel0 = this.gpu.createTexture();
    const posInit = pos0.image.data as Float32Array;
    const velInit = vel0.image.data as Float32Array;
    posInit.set(init.positions.subarray(0, posInit.length));
    velInit.set(init.velocities.subarray(0, velInit.length));

    this.posVar = this.gpu.addVariable('texturePosition', POS_FRAG, pos0);
    this.velVar = this.gpu.addVariable('textureVelocity', VEL_FRAG, vel0);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);

    const shared: Record<string, { value: number | THREE.Vector3 }> = {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uBreath: { value: 1 },
      uBreathWave: { value: 0 },
      uFormMix: { value: 0 },
      uCore: { value: new THREE.Vector3() },
      uShellK: { value: this.sim.shellStiffness },
      uCoreG: { value: this.sim.coreGravity },
      uDamping: { value: this.sim.damping },
      uCurlStrength: { value: this.sim.curlStrength },
      uCurlFreq: { value: this.sim.curlFrequency },
      uCurlSpeed: { value: this.sim.curlSpeed },
      uBodyBase: { value: this.sim.bodyBase },
      uSwirlBase: { value: this.sim.swirlBase },
      uPointerPos: { value: new THREE.Vector3(0, 0, 99) },
      uPointerVel: { value: new THREE.Vector3() },
      uPointerActive: { value: 0 },
      uPointerRadius: { value: this.sim.pointerRadius },
      uPointerPush: { value: this.sim.pointerPush },
      uImpactSpeed: { value: this.sim.impactSpeed },
      uImpactPush: { value: this.sim.impactPush },
      uScatter: { value: 0 },
      uWary: { value: 0 },
      uContract: { value: 0 },
      uEnergy: { value: this.params.energyBase },
      uPulseBoost: { value: 0 },
      uSymmetry: { value: 0.4 },
      uRing: { value: 0 },
      uDual: { value: 0 },
      uArms: { value: 1 },
      uGrowth: { value: 0 },
      uCore2Offset: { value: new THREE.Vector3() },
      uPress: { value: 0 },
      uPressStrength: { value: this.sim.pressStrength },
      uClickPos: { value: new THREE.Vector3() },
      uClickPulse: { value: 0 },
      uPointerPushMul: { value: 1 },
      uMusicBass: { value: 0 },
      uMusicTreble: { value: 0 },
    };
    Object.assign(this.posVar.material.uniforms, { uDt: shared.uDt });
    Object.assign(this.velVar.material.uniforms, shared);

    const error = this.gpu.init();
    if (error !== null) {
      throw new Error(`GPGPU 初始化失败: ${error}`);
    }

    // 渲染点云：position 仅提供顶点数，真实位置在顶点着色器里从纹理读取。
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3),
    );
    const refs = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i += 1) refs[i] = i;
    this.geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    this.geometry.setDrawRange(0, params.particleCount);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPosTex: { value: null },
        uSimSize: { value: new THREE.Vector2(SIM_W, this.simH) },
        uPointSize: { value: params.pointSize },
        uPixelRatio: { value: 1 },
        uRevealT: { value: 0 },
        uRevealSeconds: { value: params.revealSeconds },
        uFormMix: { value: 0 },
        uBreathWave: { value: 0 },
        uMoodShift: { value: 0.5 },
        uBrightness: { value: 1 },
        uGrowth: { value: 0 },
        uTime: { value: 0 },
        uEnergy: { value: params.energyBase },
        uPulseBoost: { value: 0 },
        uCoreCol: { value: new THREE.Vector3(1.0, 0.95, 0.82) },
        uBodyCol: { value: new THREE.Vector3(0.88, 0.68, 0.32) },
        uAuraCol: { value: new THREE.Vector3(0.58, 0.42, 0.18) },
        uTreble: { value: 0 },
      },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  /** 质量档位：改变活跃粒子数（缓冲按 MAX 分配，无需重建）。 */
  setActiveCount(count: number): void {
    this.particleCount = Math.min(count, MAX_PARTICLES);
    this.geometry.setDrawRange(0, this.particleCount);
  }

  /** 质量档位：粒子基础尺寸。 */
  setPointSize(size: number): void {
    this.material.uniforms.uPointSize.value = size;
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
    this.sim.bodyBase = 0.85 * bodyScale;
    this.brightnessScale = brightness;
    const shared = this.velVar.material.uniforms as Record<string, { value: number | THREE.Vector3 }>;
    shared.uBodyBase.value = this.sim.bodyBase;
    const paint = this.material.uniforms as Record<string, { value: THREE.Vector3 }>;
    paint.uCoreCol.value.set(core[0], core[1], core[2]);
    paint.uBodyCol.value.set(body[0], body[1], body[2]);
    paint.uAuraCol.value.set(aura[0], aura[1], aura[2]);
  }

  /** 每帧执行一次 GPU 模拟步进并渲染。 */
  frame(state: LifeState, dt: number): void {
    if (this.disposed) return;
    const u = this.velVar.material.uniforms as Record<
      string,
      { value: number | THREE.Vector3 }
    >;
    u.uDt.value = dt;
    u.uTime.value = state.time;
    u.uBreath.value = state.breathScale;
    u.uBreathWave.value = state.breathWave;
    u.uFormMix.value = state.formMix;
    (u.uCore.value as THREE.Vector3).set(
      state.corePosition[0],
      state.corePosition[1],
      state.corePosition[2],
    );
    (u.uPointerPos.value as THREE.Vector3).set(
      state.pointerPos[0],
      state.pointerPos[1],
      state.pointerPos[2],
    );
    (u.uPointerVel.value as THREE.Vector3).set(
      state.pointerVel[0],
      state.pointerVel[1],
      state.pointerVel[2],
    );
    u.uPointerActive.value = state.pointerActive;
    u.uScatter.value = state.scatter;
    u.uWary.value = state.wary;
    u.uContract.value = state.contract;
    u.uEnergy.value = state.energy;
    u.uPulseBoost.value = state.pulseBoost;
    u.uMusicBass.value = state.musicBass * (state.musicActive > 0.5 ? 1 : 0);
    u.uMusicTreble.value = state.musicTreble * (state.musicActive > 0.5 ? 1 : 0);
    u.uSymmetry.value = state.symmetry;
    u.uRing.value = state.ring;
    u.uDual.value = state.dualCore;
    u.uArms.value = state.arms;
    u.uGrowth.value = state.growth;
    u.uArms.value = state.arms;
    u.uGrowth.value = state.growth;
    // 双核间距随团大小缩放，避免调小后仍被拉得很开。
    const sizeN = this.sim.bodyBase / 0.85;
    (u.uCore2Offset.value as THREE.Vector3).set(
      state.core2Offset[0] * sizeN,
      state.core2Offset[1] * sizeN,
      state.core2Offset[2] * sizeN,
    );
    u.uPress.value = state.pressRamp;
    u.uPointerPushMul.value = state.pointerPushMul;
    (u.uClickPos.value as THREE.Vector3).set(
      state.clickPos[0], state.clickPos[1], state.clickPos[2]);
    u.uClickPulse.value = state.clickPulse;
    this.posVar.material.uniforms.uDt.value = dt;

    const m = this.material.uniforms;
    m.uRevealT.value = state.revealT;
    m.uFormMix.value = state.formMix;
    m.uBreathWave.value = state.breathWave;
    m.uTime.value = state.time;
    m.uEnergy.value = state.energy;
    m.uPulseBoost.value = state.pulseBoost;
    m.uBrightness.value = state.brightness * this.brightnessScale;
    m.uTreble.value = state.musicTreble;
    m.uGrowth.value = state.growth;
    m.uMoodShift.value = state.moodShift;

    this.gpu.compute();
    m.uPosTex.value = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.domElement.style.visibility = '';
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.gpu.dispose();
    this.renderer.dispose();
  }
}
