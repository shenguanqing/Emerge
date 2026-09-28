import * as THREE from 'three';
import type { LifeParams, LifeState } from '../../core/types';

/**
 * Phase 1 渲染后端：WebGL2 + Three.js 点云。
 * 验证渲染生命周期（创建/挂载/缩放/释放）与呼吸、漂移的视觉语义；
 * 粒子位置 Phase 2 起改由 GPU 模拟驱动。
 */
export class WebGL2Backend {
  readonly id = 'webgl2' as const;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  constructor(canvas: HTMLCanvasElement, params: LifeParams) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7);

    // 预生成粒子：球壳分布 + 固定随机种子；Phase 2 起位置由 GPU 模拟接管。
    const count = params.particleCount;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      // 均匀球面方向；半径 1.5–2.3 薄壳，Phase 3 起改为有机形体。
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 1.5 + Math.random() * 0.8;
      positions[i * 3] = Math.cos(theta) * s * r;
      positions[i * 3 + 1] = Math.sin(theta) * s * r;
      positions[i * 3 + 2] = u * r;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBreath: { value: 1 },
        uPointSize: { value: params.pointSize },
        uPixelRatio: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  /** 跟随画布 CSS 尺寸与 DPR 缩放；不改画布布局。 */
  resize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  /** 消费只读生命快照；不回写引擎状态。 */
  render(state: LifeState): void {
    this.material.uniforms.uTime.value = state.time;
    this.material.uniforms.uBreath.value = state.breathScale;
    this.points.position.set(
      state.corePosition[0],
      state.corePosition[1],
      state.corePosition[2],
    );
    this.renderer.render(this.scene, this.camera);
  }

  /** 释放全部 GPU 资源；调用后后端不可复用。 */
  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uBreath;
uniform float uPointSize;
uniform float uPixelRatio;
attribute float aSeed;
varying float vGlow;

void main() {
  vec3 p = position;
  // 有机微扰动：按自身种子相位做低频正弦漂移（Phase 4 由 Curl Noise 接管）。
  float t = uTime * 0.35 + aSeed;
  p += 0.06 * vec3(
    sin(t * 1.7 + aSeed * 7.0),
    sin(t * 1.3 + aSeed * 13.0),
    sin(t * 1.9 + aSeed * 23.0));
  p *= uBreath;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float depthFade = clamp(2.5 / max(-mv.z, 0.001), 0.2, 2.0);
  gl_PointSize = uPointSize * uPixelRatio * depthFade;
  vGlow = depthFade;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
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
