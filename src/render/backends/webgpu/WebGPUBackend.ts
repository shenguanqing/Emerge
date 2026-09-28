import type { LifeParams, LifeState, SimulationParams } from '../../../core/types';
import { createParticleInitData } from '../particleInit';

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
  data3: vec4f,          // count, pad, pad, pad
  data4: vec4f,          // formMix, breathWave, revealT, revealSeconds
  data5: vec4f,          // bodyBase, swirlBase, pad, pad
  pointerPos_act: vec4f, // pointer.xyz, active(0..1)
  pointerVel_pad: vec4f, // pointerVel.xyz, pad
  data6: vec4f,          // pointerRadius, pointerPush, impactSpeed, impactPush
  data7: vec4f,          // scatter, wary, contract, energy
  data8: vec4f,          // pointerPushMul, pad, pad, pad
};

@group(0) @binding(0) var<storage, read> posIn: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> posOut: array<vec4f>;
@group(0) @binding(2) var<storage, read> velIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velOut: array<vec4f>;
@group(0) @binding(4) var<uniform> sim: Sim;

fn hash1(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

// 有机形体半径：随方向低频起伏的非对称轮廓（与 WebGL2 后端保持一致）。
fn bodyRadius(dir: vec3f) -> f32 {
  var r = 1.0;
  r = r + 0.24 * sin(2.3 * dir.x + 1.7) * cos(1.9 * dir.y - 0.6);
  r = r + 0.17 * sin(3.1 * dir.z + 4.0);
  r = r + 0.11 * sin(4.7 * dir.x + 2.0) * sin(3.9 * dir.y + 1.0);
  r = r + 0.09 * sin(6.1 * dir.x + 3.7) * cos(5.7 * dir.z - 1.1);
  r = r + 0.07 * sin(2.9 * dir.x + 2.9 * dir.z + 0.5);
  return r;
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
  let swirlBase = sim.data5.y;
  let formMix = sim.data4.x;
  let breathWave = sim.data4.y;

  // 层级由种子确定：0 核心(12%) / 1 身体(74%) / 2 外围(14%)。
  let layer = select(select(2.0, 1.0, seed < 0.86), 0.0, seed < 0.12);
  let h = hash1(seed * 41.53 + 0.37);

  // 个体方向：由种子确定的固定方向。
  let a1 = hash1(seed * 17.31 + 0.13) * 6.2831853;
  let a2 = hash1(seed * 29.17 + 0.71) * 2.0 - 1.0;
  let s2 = sqrt(max(1.0 - a2 * a2, 0.0));
  let dir = vec3f(cos(a1) * s2, sin(a1) * s2, a2);

  // 分层锚点：核心致密内聚，身体贴合有机轮廓，外围松散且呼吸反相。
  // 受惊收缩：核心轻微收紧，身体明显收拢（与 WebGL2 后端一致）。
  var contractMul = 1.0 - 0.22 * sim.data7.z;
  if (layer < 0.5) { contractMul = 1.0 - 0.12 * sim.data7.z; }
  let bodyR = bodyRadius(dir) * bodyBase * breath * contractMul;
  var radMul = mix(1.22, 1.65, h) * (1.0 + 0.08 * (1.0 - breathWave));
  if (layer < 0.5) { radMul = mix(0.16, 0.34, h); }
  if (layer > 0.5 && layer < 1.5) { radMul = mix(0.88, 1.04, h); }
  let anchor = dir * bodyR * radMul;

  var stiffMul = 0.55;
  if (layer < 0.5) { stiffMul = 3.2; }
  if (layer > 0.5 && layer < 1.5) { stiffMul = 1.0; }

  // 受惊散开：身体/外围刚度暂时软化（核心软化更少，保持可辨）。
  var softMul = mix(1.0, 0.15, sim.data7.x);
  if (layer < 0.5) { softMul = mix(1.0, 0.6, sim.data7.x); }
  let goal = core + anchor;
  var force = (goal - p) * (shellK * stiffMul * softMul);

  // 核心长程吸引。
  let toCore = core - p;
  let dist = length(toCore) + 0.25;
  force = force + (toCore / dist) * (coreG / dist);

  // 凝聚期旋涡：绕竖轴的切向力，离核越远越强，随成形衰减消失。
  let swirl = max(1.0 - formMix, sim.data7.x * 0.85) * swirlBase;
  let tangent = normalize(cross(vec3f(0.0, 1.0, 0.0), toCore) + vec3f(1e-5, 0.0, 0.0));
  force = force + tangent * swirl * smoothstep(5.0, 0.5, dist);

  // Curl Noise 流场：散度为零，长时间运动不散架、不固定循环；外围更活跃。
  let flowPos = p * curlFreq + vec3f(0.0, 0.0, time * curlSpeed);
  var curlMul = 1.5;
  if (layer < 0.5) { curlMul = 0.3; }
  if (layer > 0.5 && layer < 1.5) { curlMul = 1.0; }
  force = force + curlNoise(flowPos) * (curlStrength * (0.55 + 0.9 * sim.data7.w) * curlMul);

  // 指针力场：物理存在（温和排斥）+ 高速冲击（冲击波 + 拖拽尾迹）。
  if (sim.pointerPos_act.w > 0.01) {
    let toP = sim.pointerPos_act.xyz - p;
    let dP = length(toP) + 1e-4;
    let influence = smoothstep(sim.data6.x, 0.0, dP);
    let away = -toP / dP;
    let speed = length(sim.pointerVel_pad.xyz);
    let impact = smoothstep(sim.data6.z, sim.data6.z * 2.5, speed) * influence;
    let waryMul = 1.0 + sim.data7.y * 0.6;
    force = force + away * (influence * sim.data6.y * sim.data8.x * waryMul + impact * sim.data6.w * 3.0);
    force = force + sim.pointerVel_pad.xyz * impact * 0.9;
  }

  // 半隐式欧拉 + 指数阻尼；dt 由 CPU 侧钳制。
  v = (v + force * dt) * exp(-damping * dt);
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
  data3: vec4f,          // moodShift, pad, pad, pad
};

@group(0) @binding(0) var<storage, read> pos: array<vec4f>;
@group(0) @binding(1) var<uniform> r: R;

struct VOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) layer: f32,
  @location(2) alpha: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let p4 = pos[ii];
  let seed = p4.w;
  let layer = select(select(2.0, 1.0, seed < 0.86), 0.0, seed < 0.12);

  let clip = r.vp * vec4f(p4.xyz, 1.0);
  let depthFade = clamp(2.5 / max(clip.w, 0.001), 0.2, 2.0);

  // 逐个显现：t0 = seed × revealSeconds，0.8 秒平滑淡入。
  let t0 = seed * r.data2.w;
  var reveal = clamp((r.data2.z - t0) / 0.8, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  var sizeMul = 0.9;
  if (layer < 0.5) { sizeMul = 1.5; }
  if (layer > 0.5 && layer < 1.5) { sizeMul = 1.0; }
  sizeMul = sizeMul * mix(1.35, 1.0, r.data2.x);
  let pointPx = r.data.x * depthFade * sizeMul;
  let halfNdc = corner * (pointPx / vec2f(r.data.y, r.data.z));

  var result: VOut;
  result.position = vec4f(clip.xy + halfNdc * clip.w, clip.z, clip.w);
  result.uv = corner;
  result.layer = layer;
  result.alpha = reveal * mix(0.7, 1.0, r.data2.x);
  return result;
}

@fragment
fn fs(vin: VOut) -> @location(0) vec4f {
  let d = length(vin.uv);
  var a = smoothstep(1.0, 0.24, d);
  a = 0.30 + 0.70 * a * a;

  // 分层配色：核心亮冰白随呼吸脉动、身体冷蓝、外围深蓝；克制不堆砌。
  let breathWave = r.data2.y;
  let coreCol = mix(vec3f(0.90, 0.95, 1.0), vec3f(1.0, 0.96, 0.9), r.data3.x * 0.35)
              * (1.6 + 1.0 * breathWave);
  let bodyCol = vec3f(0.42, 0.62, 0.95) * 1.35;
  let auraCol = vec3f(0.24, 0.40, 0.75) * 0.8;
  var col = auraCol;
  var layerAlpha = 0.55;
  if (vin.layer < 0.5) { col = coreCol; layerAlpha = 1.0; }
  if (vin.layer > 0.5 && vin.layer < 1.5) { col = bodyCol; layerAlpha = 0.85; }
  let depthFade = clamp(2.5 / max(vin.position.w, 0.001), 0.2, 2.0);
  let glow = col * (0.85 + 0.15 * depthFade);
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
  readonly particleCount: number;

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
  /** [0..15] VP；[16..19] pointSizePx, viewportW, viewportH, unused；[20..23] formMix, breathWave, revealT, revealSeconds；[24] moodShift。 */
  private readonly renderData = new Float32Array(28);
  private readonly simData = new Float32Array(56);
  private readonly pointSize: number;
  private clearAlpha = 1;
  private readIdx = 0;
  private disposed = false;

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

    const init = createParticleInitData(params.particleCount);
    const bufSize = params.particleCount * 16;
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
      size: 224,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniform = device.createBuffer({
      size: 112,
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
        ],
      });
    this.renderBinds = [mkRenderBind(0), mkRenderBind(1)];

    this.updateCameraUniform();

    void device.lost.then(() => {
      this.disposed = true;
    });
    // 未捕获的管线/着色器校验错误上抛到诊断通道，避免静默黑屏。
    device.onuncapturederror = (ev) => {
      const w = window as typeof window & { __emergeErrors?: string[] };
      w.__emergeErrors?.push(`GPU: ${ev.error.message.slice(0, 300)}`);
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
      const backend = new WebGPUBackend(device, context, format, canvas, params, sim);
      backend.clearAlpha = transparent ? 0 : 1;
      return backend;
    } catch {
      return null;
    }
  }

  private updateCameraUniform(): void {
    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const proj = perspectiveWebGPU((50 * Math.PI) / 180, aspect, 0.1, 100);
    // 视图：相机固定在 (0, 0, 7) 看向原点，即平移 (0, 0, -7)。
    const view = new Float32Array(16);
    view[0] = 1; view[5] = 1; view[10] = 1; view[15] = 1;
    view[14] = -7;
    this.renderData.set(mat4Multiply(proj, view), 0);
  }

  /** 每帧执行一次 Compute 步进并渲染。 */
  frame(state: LifeState, dt: number): void {
    if (this.disposed) return;
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
    this.simData[16] = state.formMix;
    this.simData[17] = state.breathWave;
    this.simData[20] = this.sim.bodyBase;
    this.simData[21] = this.sim.swirlBase;
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
    this.simData[40] = state.scatter;
    this.simData[41] = state.wary;
    this.simData[42] = state.contract;
    this.simData[43] = state.energy;
    this.simData[48] = state.pointerPushMul;
    d.queue.writeBuffer(this.simUniform, 0, this.simData);

    this.renderData[20] = state.formMix;
    this.renderData[21] = state.breathWave;
    this.renderData[22] = state.revealT;
    this.renderData[23] = this.params.revealSeconds;
    this.renderData[24] = state.moodShift;
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
  }

  resize(width: number, height: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
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
