# Phase 3 交付记录：基础形态

## 范围与状态

- 阶段：Phase 3；日期：2026-09-28；对应提交：Phase 3 交付提交。
- 本阶段实际交付：
  - 有机形体轮廓：`bodyRadius(dir)` 方向低频起伏函数（两后端数值一致），替换 Phase 2 的球壳锚点，轮廓非对称、不规则。
  - 三层结构可辨：核心（12%，致密内聚、亮冰白、尺寸×1.5、刚度×3.2）、身体（74%，贴合成形轮廓、冷蓝）、外围（14%，松散光晕、深蓝、刚度×0.55、湍流×1.6、呼吸反相扩散）。
  - 呼吸：核心尺度 1→1.08→1 平滑振荡（breathWave 驱动核心亮度脉动与外围反相扩散），无硬切换。
  - 启动凝聚编排：0.8s 黑场 → 粒子按种子逐个显现（0.8s 平滑淡入）→ 旋涡切向力卷动收拢（离核越远越强）→ 约 7.5s smoothstep 成形，旋涡力随 formMix 衰减至 0；无位置瞬移。
  - 引擎扩展：LifeState 增加 breathWave / formMix / revealT；LifeParams 增加 coalesceSeconds / revealSeconds；层级由 seed 确定性导出（初始化与两侧 shader 一致）。
- 完成状态：通过（macOS，WebGPU 与 WebGL2 分别验证）。
- 未完成项：Windows 未测；形体细节的持续打磨为长期调参工作，不阻塞后续阶段。

## 运行与检查

- 命令同前：`npm run dev` / `npm run build` / `npm run preview`。
- 自动化检查：`npm run build` 通过。
- 视觉检查（截图逐帧观察）：
  - t≈4s：中央出现亮带旋涡，外围蓝色云团呈螺旋收拢——「星云凝聚」观感成立。
  - t≈13s：成形生命体——亮白呼吸核心 + 不规则有机蓝色身体环 + 稀疏深蓝外围光晕；不是普通发光球体。
  - 两后端画面语义一致。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB） |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | WebGPU Compute（apple metal-3）与 WebGL2 GPGPU 分别验证 |
| 分辨率、像素比与窗口模式 | 1280×720 视口，画布 DPR 2.0 |
| 粒子数、质量档位 | 32,768 |
| 场景、预热与测量时长 | 完整启动序列（0–13.5s）分帧截图观察 |
| 平均 FPS / P95 帧时间 | 两后端均 120 FPS |
| CPU / GPU 占用、功耗、内存趋势 | 未测（Phase 9） |
| 输入、隐藏、休眠与恢复 | 未变（Phase 5/9） |
| 透明合成与窗口控制 | 未验证（Phase 8） |

## 过程中发现并修复的问题

1. WGSL 保留字 `target` 导致整个 ShaderModule 解析失败、WebGPU 管线静默黑屏；已通过 `device.onuncapturederror` 将未捕获 GPU 校验错误接入诊断通道（`window.__emergeErrors`），并改名 `goal`。
2. 初版形体函数四重对称偏强（「坐垫」观感）；追加对角向与高频扰动项打破对称。
3. 凝聚早期过暗：粒子尺寸乘 `mix(1.35, 1.0, formMix)`（凝聚期能量集中感）并把凝聚期最低 alpha 从 0.55 提至 0.7。

## 体验结论与后续

- Phase 3 完成条件达成：三层可辨、有机轮廓、不呈现普通发光球；启动凝聚序列符合第一版体验脚本。
- 下一阶段：Phase 4 Flow Field / Curl Noise——用真实 Curl Noise 替换三角函数湍流，验证长时间运动不散架、无固定循环。
