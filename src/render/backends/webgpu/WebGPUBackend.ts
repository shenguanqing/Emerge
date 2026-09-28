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
  data2: vec4f,          // coreG, noiseAmp, radiusMin, radiusMax
  data3: vec4f,          // count, pad, pad, pad
};

@group(0) @binding(0) var<storage, read> posIn: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> posOut: array<vec4f>;
@group(0) @binding(2) var<storage, read> velIn: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velOut: array<vec4f>;
@group(0) @binding(4) var<uniform> sim: Sim;

fn hash1(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

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
  let noiseAmp = sim.data2.y;
  let rMin = sim.data2.z;
  let rMax = sim.data2.w;

  // 个体锚点：由种子确定的方向与半径（Phase 3 起替换为有机形体采样）。
  let a1 = hash1(seed * 17.31 + 0.13) * 6.2831853;
  let a2 = hash1(seed * 29.17 + 0.71) * 2.0 - 1.0;
  let s2 = sqrt(max(1.0 - a2 * a2, 0.0));
  let rad = mix(rMin, rMax, hash1(seed * 41.53 + 0.37));
  let anchor = vec3f(cos(a1) * s2, sin(a1) * s2, a2) * rad * breath;

  // 锚点弹簧 + 核心长程吸引 + 湍流（Phase 4 换 Curl Noise）。
  var force = (core + anchor - p) * shellK;
  let toCore = core - p;
  let dist = length(toCore) + 0.25;
  force = force + (toCore / dist) * (coreG / dist);

  let t = time * 0.6 + seed * 12.0;
  let turb = vec3f(
    sin(t * 1.1 + p.y * 1.3),
    sin(t * 1.3 + p.z * 1.1),
    sin(t * 1.7 + p.x * 0.9));
  force = force + turb * noiseAmp;

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
};

@group(0) @binding(0) var<storage, read> pos: array<vec4f>;
@group(0) @binding(1) var<uniform> r: R;

struct VOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let corner = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2.0 - 1.0;
  let p4 = pos[ii];
  let clip = r.vp * vec4f(p4.xyz, 1.0);
  let depthFade = clamp(2.5 / max(clip.w, 0.001), 0.2, 2.0);
  let pointPx = r.data.x * depthFade;
  let halfNdc = corner * (pointPx / vec2f(r.data.y, r.data.z));
  var result: VOut;
  result.position = vec4f(clip.xy + halfNdc * clip.w, clip.z, clip.w);
  result.uv = corner;
  return result;
}

@fragment
fn fs(vin: VOut) -> @location(0) vec4f {
  let d = length(vin.uv);
  var a = smoothstep(1.0, 0.24, d);
  a = 0.30 + 0.70 * a * a;
  // 克制的冷蓝辉光：外围偏深蓝，近处微亮白，避免霓虹堆砌。
  let cool = vec3f(0.38, 0.58, 0.92) * 1.6;
  let bright = vec3f(0.85, 0.93, 1.0) * 1.6;
  let depthFade = clamp(2.5 / max(vin.position.w, 0.001), 0.2, 2.0);
  let col = mix(cool, bright, clamp(depthFade * 0.45, 0.0, 1.0));
  return vec4f(col * a, a);
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
  /** [0..15] VP 矩阵；[16..19] pointSizePx, viewportW, viewportH, unused。 */
  private readonly renderData = new Float32Array(20);
  private readonly simData = new Float32Array(16);
  private readonly pointSize: number;
  private dpr = 1;
  private readIdx = 0;
  private disposed = false;

  private constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    canvas: HTMLCanvasElement,
    params: LifeParams,
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
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniform = device.createBuffer({
      size: 80,
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

    void device.lost.then(() => {
      this.disposed = true;
    });
  }

  /** 探测并创建后端；任何失败返回 null（上层回退 WebGL2）。 */
  static async create(
    canvas: HTMLCanvasElement,
    params: LifeParams,
    sim: SimulationParams,
  ): Promise<WebGPUBackend | null> {
    try {
      if (!navigator.gpu) return null;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu');
      if (!context) return null;
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'opaque' });
      return new WebGPUBackend(device, context, format, canvas, params, sim);
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

  private updateSizeUniform(): void {
    this.renderData[16] = this.pointSize * this.dpr;
    this.renderData[17] = this.canvas.width;
    this.renderData[18] = this.canvas.height;
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
    this.simData[9] = this.sim.turbulenceAmp;
    this.simData[10] = this.sim.radiusMin;
    this.simData[11] = this.sim.radiusMax;
    this.simData[12] = this.particleCount;
    d.queue.writeBuffer(this.simUniform, 0, this.simData);

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
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
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
    this.dpr = dpr;
    this.updateSizeUniform();
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
