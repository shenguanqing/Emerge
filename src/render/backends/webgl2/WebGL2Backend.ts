import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import type { LifeParams, LifeState, SimulationParams } from '../../../core/types';
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
uniform float uNoiseAmp;
uniform float uBodyBase;
uniform float uSwirlBase;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }

// 有机形体半径：随方向低频起伏的非对称轮廓（与 WebGPU 后端保持一致）。
float bodyRadius(vec3 dir) {
  float r = 1.0;
  r += 0.24 * sin(2.3 * dir.x + 1.7) * cos(1.9 * dir.y - 0.6);
  r += 0.17 * sin(3.1 * dir.z + 4.0);
  r += 0.11 * sin(4.7 * dir.x + 2.0) * sin(3.9 * dir.y + 1.0);
  r += 0.09 * sin(6.1 * dir.x + 3.7) * cos(5.7 * dir.z - 1.1);
  r += 0.07 * sin(2.9 * dir.x + 2.9 * dir.z + 0.5);
  return r;
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
  float bodyR = bodyRadius(dir) * uBodyBase * uBreath;
  float radMul = layer < 0.5 ? mix(0.16, 0.34, h)
               : layer < 1.5 ? mix(0.88, 1.04, h)
               : mix(1.22, 1.65, h) * (1.0 + 0.08 * (1.0 - uBreathWave));
  vec3 anchor = dir * bodyR * radMul;

  float stiffMul = layer < 0.5 ? 3.2 : (layer < 1.5 ? 1.0 : 0.55);
  vec3 target = uCore + anchor;
  vec3 force = (target - p) * (uShellK * stiffMul);

  // 核心长程吸引。
  vec3 toCore = uCore - p;
  float dist = length(toCore) + 0.25;
  force += (toCore / dist) * (uCoreG / dist);

  // 凝聚期旋涡：绕竖轴的切向力，离核越远越强，随成形衰减消失。
  float swirl = (1.0 - uFormMix) * uSwirlBase;
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), toCore) + vec3(1e-5, 0.0, 0.0));
  force += tangent * swirl * smoothstep(5.0, 0.5, dist);

  // 湍流（Phase 4 换 Curl Noise）：外围更活跃。
  float t = uTime * 0.6 + seed * 12.0;
  vec3 turb = vec3(
    sin(t * 1.1 + p.y * 1.3),
    sin(t * 1.3 + p.z * 1.1),
    sin(t * 1.7 + p.x * 0.9));
  float turbMul = layer < 0.5 ? 0.5 : (layer < 1.5 ? 1.0 : 1.6);
  force += turb * (uNoiseAmp * turbMul);

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
attribute float aRef;
varying float vGlow;
varying float vAlpha;
varying float vLayer;

void main() {
  float ref = aRef + 0.5;
  vec2 uv = vec2(mod(ref, uSimSize.x), floor(ref / uSimSize.x)) / uSimSize;
  vec4 p4 = texture2D(uPosTex, uv);
  vec3 p = p4.xyz;
  float seed = p4.w;
  float layer = seed < 0.12 ? 0.0 : (seed < 0.86 ? 1.0 : 2.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float depthFade = clamp(2.5 / max(-mv.z, 0.001), 0.2, 2.0);

  // 逐个显现：t0 = seed × revealSeconds，0.8 秒平滑淡入。
  float t0 = seed * uRevealSeconds;
  float reveal = clamp((uRevealT - t0) / 0.8, 0.0, 1.0);
  reveal = reveal * reveal * (3.0 - 2.0 * reveal);

  float sizeMul = (layer < 0.5 ? 1.5 : (layer < 1.5 ? 1.0 : 0.9)) * mix(1.35, 1.0, uFormMix);
  gl_PointSize = uPointSize * uPixelRatio * depthFade * sizeMul;
  vGlow = depthFade;
  vLayer = layer;
  vAlpha = reveal * mix(0.7, 1.0, uFormMix);
}
`;

const POINTS_FRAG = /* glsl */ `
precision mediump float;
uniform float uBreathWave;
varying float vGlow;
varying float vAlpha;
varying float vLayer;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.12, d);
  a = 0.30 + 0.70 * a * a;

  // 分层配色：核心亮冰白随呼吸脉动、身体冷蓝、外围深蓝；克制不堆砌。
  vec3 coreCol = vec3(0.90, 0.95, 1.0) * (1.6 + 1.0 * uBreathWave);
  vec3 bodyCol = vec3(0.42, 0.62, 0.95) * 1.35;
  vec3 auraCol = vec3(0.24, 0.40, 0.75) * 0.8;
  vec3 col = vLayer < 0.5 ? coreCol : (vLayer < 1.5 ? bodyCol : auraCol);
  float layerAlpha = vLayer < 0.5 ? 1.0 : (vLayer < 1.5 ? 0.85 : 0.55);
  col *= (0.85 + 0.15 * vGlow);
  gl_FragColor = vec4(col * a, a * vAlpha * layerAlpha);
}
`;

type SimVariable = ReturnType<GPUComputationRenderer['addVariable']>;

export class WebGL2Backend {
  readonly id = 'webgl2' as const;
  readonly particleCount: number;
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
      uNoiseAmp: { value: this.sim.turbulenceAmp },
      uBodyBase: { value: this.sim.bodyBase },
      uSwirlBase: { value: this.sim.swirlBase },
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
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

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
    u.uBreathWave.value = state.breathWave;
    u.uFormMix.value = state.formMix;
    (u.uCore.value as THREE.Vector3).set(
      state.corePosition[0],
      state.corePosition[1],
      state.corePosition[2],
    );
    this.posVar.material.uniforms.uDt.value = dt;

    const m = this.material.uniforms;
    m.uRevealT.value = state.revealT;
    m.uFormMix.value = state.formMix;
    m.uBreathWave.value = state.breathWave;

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
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.gpu.dispose();
    this.renderer.dispose();
  }
}
