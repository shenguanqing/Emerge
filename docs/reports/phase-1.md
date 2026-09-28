# Phase 1 交付记录：架构与渲染 Prototype

## 范围与状态

- 阶段：Phase 1；日期：2026-09-28；对应提交：Phase 1 交付提交（本仓库 Phase 1 全部变更）。
- 本阶段实际交付：Vue 3 + TypeScript + Vite 工程；core / render / input 分层；GPU 能力探测（WebGPU / WebGL2）；WebGL2 点云渲染 Prototype（8,192 粒子、呼吸缩放、核心自主漂移）；诊断显示（后端 / FPS / 粒子数 / DPR）。
- 完成状态：通过（Web 端，macOS）。
- 未完成项：WebGPU Compute 模拟后端属 Phase 2；透明桌面窗口属 Phase 8；Windows 平台未测（本阶段仅 macOS）。

## 运行与检查

- 安装：`npm install`
- 开发：`npm run dev`
- 类型检查 + 构建：`npm run build`（vue-tsc --noEmit + vite build）
- 预览构建产物：`npm run preview -- --port 4173`
- 自动化检查结果：`npm run build` 通过（TypeScript strict，无类型错误；产物 592.8 kB / gzip 157.1 kB）。
- 视觉检查：黑底中央粒子球壳云清晰可见，随呼吸缓慢缩放、核心缓慢漂移；左下诊断条显示后端与帧率；控制台无错误。初始版本粒子过暗，已调高基础亮度与点尺寸（最终视觉语言在 Phase 3 细化）。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB），ANGLE Metal Renderer: Apple M1 Pro |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | 渲染 WebGL2；WebGPU 探测可用（apple metal-3），尚未用于模拟 |
| 分辨率、像素比与窗口模式 | 1280×720 视口，画布 DPR 2.0，浏览器窗口模式 |
| 粒子数、质量档位 | 8,192（Phase 1 原型规模，Phase 2 提升） |
| 场景、预热与测量时长 | 启动后约 3 秒读取，持续运行观察 |
| 平均 FPS / P95 帧时间 | 112–120 FPS（0.5 秒滑动窗口平均）；P95 未测 |
| CPU / GPU 占用、功耗、内存趋势 | 未测（Phase 9 项） |
| 输入、隐藏、休眠与恢复 | PointerSystem 位置/速度采集已接入；隐藏/休眠节流属 Phase 9 |
| 透明合成与窗口控制 | 未验证（Phase 8 项） |

## 生命周期验证

- 挂载 → 渲染 → 缩放：ResizeObserver 与 DPR 跟随验证通过（诊断条 DPR 实时更新）。
- 卸载与释放：`app.unmount()` 后 canvas 从 DOM 移除、rAF 取消、geometry/material/renderer dispose 执行；window error 监听为空。
- 同一 app 实例二次 `mount()` 无渲染（Vue 3 行为）；页面刷新重新创建正常。产品路径（刷新 / HMR）不受影响。

## 体验结论与后续

- Phase 1 完成条件达成：Web 可运行；WebGPU / WebGL2 可用性已探测并记录；真实启动、构建与预览命令建立。
- 下一阶段：Phase 2 GPU Particle Simulation——WebGPU Compute 优先、WebGL2 GPGPU（ping-pong 位置/速度纹理）后备，目标 ≥20k 粒子稳定模拟。
