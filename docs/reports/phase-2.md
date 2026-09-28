# Phase 2 交付记录：GPU Particle Simulation

## 范围与状态

- 阶段：Phase 2；日期：2026-09-28；对应提交：Phase 2 交付提交。
- 本阶段实际交付：
  - WebGPU Compute 后端（WGSL compute 管线，storage buffer 位置/速度 ping-pong，自定义渲染管线逐实例展开点精灵）。
  - WebGL2 GPGPU 后备后端（three.js GPUComputationRenderer，浮点纹理 ping-pong，浮点渲染目标缺失时降级 HalfFloat）。
  - 共享力场参数语义（core/types.ts SimulationParams）：锚点弹簧、核心长程吸引、指数阻尼、湍流近似；两后端 shader 数值一致。
  - 后端自动选择（WebGPU 优先）与 `?backend=webgpu|webgl2` 强制覆盖；初始化失败自动回退。
  - 32,768 粒子（≥20k 目标）；分段帧耗时计时装instrumentation（compute/render）。
- 完成状态：通过（macOS，两种后端分别验证）。
- 未完成项：Windows 平台未测（本阶段仅 macOS）；Curl Noise 属 Phase 4（当前为三角函数湍流近似，已在 shader 注释标明替换点）。

## 运行与检查

- 命令同 Phase 1：`npm run dev` / `npm run build` / `npm run preview`。
- 强制后端验证：`http://localhost:4173/?backend=webgpu` 与 `?backend=webgl2`。
- 自动化检查：`npm run build` 通过。
- 视觉检查：两后端均呈现粒子由松散初始分布（半径 ≤3.5）被力场收拢为壳层（1.25–2.2 + 湍流），核心缓慢漂移，呼吸缩放生效。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB） |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | WebGPU Compute（apple metal-3）与 WebGL2 GPGPU 分别验证 |
| 分辨率、像素比与窗口模式 | 1280×720 视口，画布 DPR 2.0 |
| 粒子数、质量档位 | 32,768 |
| 场景、预热与测量时长 | 启动后约 4 秒读取；持续运行观察 |
| 平均 FPS / P95 帧时间 | 两后端均 120 FPS（0.5 秒滑动窗口）；P95 未测 |
| CPU / GPU 占用、功耗、内存趋势 | CPU 侧 compute/render 提交耗时约 0.1–0.2 ms/帧（分段计时） |
| 输入、隐藏、休眠与恢复 | 未变（Phase 5/9） |
| 透明合成与窗口控制 | 未验证（Phase 8） |

## 过程中发现并修复的问题

1. WebGPU render uniform 布局重叠：VP 矩阵（16 floats）与点尺寸块（原置于 [12..15]）相互覆盖导致点尺寸为 0、画面全黑；已将尺寸块移至 [16..19]。
2. WebGL2 原生 GPGPU 方案把原生 WebGLTexture 直接传入 three 材质采样器导致异常（噪声块伪影）；改为官方 GPUComputationRenderer。
3. **ANGLE（Electron/Chromium 146）下 three 显式 GLSL3（GLSL3 版本标识 + texture()/in/out）点材质出现病理性表现：帧率跌至 10–28 FPS 且点精灵呈巨大方块伪影。** 隔离实验证明与粒子数、纹理采样、着色器程序数、NaN 均无关；改回 GLSL1 风格（texture2D/varying/gl_FragColor，与 three 官方 GPGPU 示例一致）后恢复 120 FPS。此问题已记录，后续 Shader 编写遵循 GLSL1 风格以规避。

## 生命周期

- 卸载释放：两后端 dispose 均销毁各自 GPU 资源（纹理/FBO/程序 或 storage/uniform buffer）。
- WebGPU device lost 已监听并置 disposed，跳过后续帧操作。

## 体验结论与后续

- Phase 2 完成条件达成：≥20k（32,768）粒子在两种后端均稳定模拟，WebGPU 优先、WebGL2 后备路径可用。
- 下一阶段：Phase 3 基础形态——Core/Body/Aura 三层可辨、有机轮廓（替换球壳锚点）、启动凝聚编排。
