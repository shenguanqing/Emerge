import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { LifeParams, LifeState, SimulationParams } from '../../../core/types';
import { createParticleInitData } from '../particleInit';

/**
 * WebGL2 后端：Three.js 点渲染 + GPUComputationRenderer 做 GPGPU 模拟。
 * 位置/速度保存在浮点纹理中 ping-pong 双缓冲；力语义与 WebGPU 后端一致。
 * 若硬件不支持浮点渲染目标，自动降级 HalfFloat（精度略低但可运行）。
 */

/** 模拟纹理宽度；高度 = ceil(count / 256)。 */
const SIM_W = 256;

/** 速度更新：力 → 新速度。 */
const VEL_FRAG = /* glsl */ `
uniform float uDt;
uniform float uTime;
uniform float uBreath;
uniform vec3 uCore;
uniform float uShellK;
uniform float uCoreG;
uniform float uDamping;
uniform float uNoiseAmp;
uniform float uRadiusMin;
uniform float uRadiusMax;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p4 = texture2D(texturePosition, uv);
  vec4 v4 = texture2D(textureVelocity, uv);
  vec3 p = p4.xyz;
  float seed = p4.w;
  vec3 v = v4.xyz;

  // 个体锚点：由种子确定的方向与半径（Phase 3 起替换为有机形体采样）。
  float a1 = hash1(seed * 17.31 + 0.13) * 6.2831853;
  float a2 = hash1(seed * 29.17 + 0.71) * 2.0 - 1.0;
  float s2 = sqrt(max(1.0 - a2 * a2, 0.0));
  float rad = mix(uRadiusMin, uRadiusMax, hash1(seed * 41.53 + 0.37));
  vec3 anchor = vec3(cos(a1) * s2, sin(a1) * s2, a2) * rad * uBreath;

  // 锚点弹簧 + 核心长程吸引 + 湍流（Phase 4 换 Curl Noise）。
  vec3 target = uCore + anchor;
  vec3 force = (target - p) * uShellK;

  vec3 toCore = uCore - p;
  float dist = length(toCore) + 0.25;
  force += (toCore / dist) * (uCoreG / dist);

  float t = uTime * 0.6 + seed * 12.0;
  vec3 turb = vec3(
    sin(t * 1.1 + p.y * 1.3),
    sin(t * 1.3 + p.z * 1.1),
    sin(t * 1.7 + p.x * 0.9));
  force += turb * uNoiseAmp;

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
attribute float aRef;
varying float vGlow;

void main() {
  float ref = aRef + 0.5;
  vec2 uv = vec2(mod(ref, uSimSize.x), floor(ref / uSimSize.x)) / uSimSize;
  vec4 p4 = texture2D(uPosTex, uv);
  vec4 mv = modelViewMatrix * vec4(p4.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  float depthFade = clamp(2.5 / max(-mv.z, 0.001), 0.2, 2.0);
  gl_PointSize = uPointSize * uPixelRatio * depthFade;
  vGlow = depthFade;
}
`;

const POINTS_FRAG = /* glsl */ `
precision mediump float;
varying float vGlow;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.12, d);
  a = 0.30 + 0.70 * a * a;
  // 克制的冷蓝辉光：外围偏深蓝，近处微亮白，避免霓虹堆砌。
  vec3 cool = vec3(0.38, 0.58, 0.92);
  vec3 bright = vec3(0.85, 0.93, 1.0);
  vec3 col = mix(cool, bright, clamp(vGlow * 0.45, 0.0, 1.0)) * 1.6;
  gl_FragColor = vec4(col * a, a);
}
`;

type SimVariable = ReturnType<GPUComputationRenderer['addVariable']>;

export class WebGL2Backend {
  readonly id = 'webgl2' as const;
  readonly particleCount: number;
  /** 分段帧耗时（毫秒），用于诊断覆盖层与性能回归排查。 */
  readonly timings = { computeMs: 0, renderMs: 0 };
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
    params: LifeParams,
    private readonly sim: SimulationParams,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);
    this.camera.position.set(0, 0, 7);
    this.particleCount = params.particleCount;
    this.simH = Math.ceil(params.particleCount / SIM_W);

    // 浮点渲染目标不可用时降级 HalfFloat，保持可用性。
    this.gpu = new GPUComputationRenderer(SIM_W, this.simH, this.renderer);
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      this.gpu.setDataType(THREE.HalfFloatType);
    }

    const init = createParticleInitData(params.particleCount);
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

    const shared: Record<string, { value: unknown }> = {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uBreath: { value: 1 },
      uCore: { value: new THREE.Vector3() },
      uShellK: { value: this.sim.shellStiffness },
      uCoreG: { value: this.sim.coreGravity },
      uDamping: { value: this.sim.damping },
      uNoiseAmp: { value: this.sim.turbulenceAmp },
      uRadiusMin: { value: this.sim.radiusMin },
      uRadiusMax: { value: this.sim.radiusMax },
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
      new THREE.BufferAttribute(new Float32Array(params.particleCount * 3), 3),
    );
    const refs = new Float32Array(params.particleCount);
    for (let i = 0; i < params.particleCount; i += 1) refs[i] = i;
    this.geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPosTex: { value: null },
        uSimSize: { value: new THREE.Vector2(SIM_W, this.simH) },
        uPointSize: { value: params.pointSize },
        uPixelRatio: { value: 1 },
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
    (u.uCore.value as THREE.Vector3).set(
      state.corePosition[0],
      state.corePosition[1],
      state.corePosition[2],
    );
    this.posVar.material.uniforms.uDt.value = dt;

    let t0 = performance.now();
    this.gpu.compute();
    this.timings.computeMs = performance.now() - t0;
    this.material.uniforms.uPosTex.value = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.timings.renderMs = performance.now() - t0;
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
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.gpu.dispose();
    this.renderer.dispose();
  }
}
