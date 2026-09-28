# Phase 4 交付记录：Flow Field / Curl Noise

## 范围与状态

- 阶段：Phase 4；日期：2026-09-28；对应提交：Phase 4 交付提交。
- 本阶段实际交付：
  - Simplex Noise 3D（Ashima Arts / Ian McEwan 公有领域实现）分别以 GLSL 与 WGSL 移植，两后端数值语义一致。
  - Curl Noise 流场：以同一标量场的三个固定偏移构成向量势，中心差分求旋度（每粒子 18 次采样），散度为零。
  - 流场时间演化：采样域沿 z 缓慢漂移（curlSpeed=0.06），避免固定循环。
  - 分层权重：核心×0.3 / 身体×1.0 / 外围×1.5，外围更活跃。
  - 参数替换：SimulationParams.turbulenceAmp → curlStrength / curlFrequency / curlSpeed（默认 0.85 / 0.5 / 0.06）。
- 完成状态：通过（macOS，WebGPU 与 WebGL2 分别验证）。
- 未完成项：Windows 未测；流场频率/强度为初始调参值，后续随 DNA（noiseFrequency/noiseStrength）接入调整。

## 运行与检查

- 命令同前；`?backend=webgpu|webgl2` 分别验证。
- 自动化检查：`npm run build` 通过。
- 视觉检查：
  - 身体呈烟雾/星云状流动纹理（对比 Phase 3 的静态壳层），核心保持致密凝聚。
  - 长时间稳定性：持续运行约 60 秒后形态完整——核心凝聚、身体有界、外围不乱飞，流动纹理随时间演化（对比不同时刻截图可见形状变化，非固定循环）。
  - 两后端画面语义一致，均 120 FPS，无 GPU 校验错误。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB） |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | WebGPU Compute（apple metal-3）与 WebGL2 GPGPU 分别验证 |
| 分辨率、像素比与窗口模式 | 1280×720 视口，画布 DPR 2.0 |
| 粒子数、质量档位 | 32,768 |
| 场景、预热与测量时长 | 启动序列 + 约 60 秒持续运行观察 |
| 平均 FPS / P95 帧时间 | 两后端均 120 FPS（18 次/粒子噪声采样未造成帧率损失） |
| CPU / GPU 占用、功耗、内存趋势 | 未测（Phase 9） |
| 输入、隐藏、休眠与恢复 | 未变（Phase 5/9） |
| 透明合成与窗口控制 | 未验证（Phase 8） |

## 过程中发现并修复的问题

1. WGSL 计算内核改造时丢失 bodyBase/swirlBase 局部绑定导致 ShaderModule 解析失败（unresolved value）；通过扩展 Sim uniform 结构（data5 槽位，96 字节）修复。
2. 诊断通道（device.onuncapturederror → window.__emergeErrors）在此过程中证明了快速定位 WGSL 错误的价值，保留为常驻机制。

## 体验结论与后续

- Phase 4 完成条件达成：相关流动成立，长时间运动不散架，无固定循环与随机乱飞。
- 下一阶段：Phase 5 Pointer Force Field——指针作为物理对象接入力场（靠近感知/速度冲击），带生物式反应延迟。
