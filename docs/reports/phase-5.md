# Phase 5 交付记录：Pointer Force Field

## 范围与状态

- 阶段：Phase 5；日期：2026-09-28；对应提交：Phase 5 交付提交。
- 本阶段实际交付：
  - PointerSystem 升级：位置/速度换算到生命体世界坐标（与渲染相机 fov 50°、距离 7 一致），enter/move/leave 活跃判定。
  - 指针感知延迟（core/PointerPerception.ts，纯 TS）：位置 tau≈180ms、速度 tau≈260ms 的指数滞后，生命体不会瞬时响应；感知活跃度 0..1 连续值。
  - LifeEngine 集成感知：`setPointer(raw)` + `update` 内平滑，LifeState 输出 pointerPos/pointerVel/pointerActive。
  - 指针力场（两后端一致）：温和排斥（物理存在）+ 高速冲击（冲击波 + 沿划动方向的拖拽尾迹）；冲击强度随速度 smoothstep(uImpactSpeed, ×2.5) 上升。
  - 参数：pointerRadius 2.6 / pointerPush 1.8 / impactSpeed 2.0 / impactPush 9.0（冲击项 ×3 等效冲量）。
- 完成状态：通过（macOS，WebGPU 后端实测；WebGL2 同一力场语义随 Phase 6 一并复验）。
- 未完成项：「熟悉后主动靠近」等信任相关响应属 Phase 7 行为系统；点击波纹/长按吸引场按交互分期属后续细化。

## 运行与检查

- 命令同前；`npm run build` 通过。
- 实测方法：浏览器 CDP 输入（cua.move/drag）+ 页面内合成 PointerEvent，读取 `window.__emergeEngine.state` 感知数据与分帧截图对比。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB） |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | WebGPU Compute（apple metal-3） |
| 分辨率、像素比与窗口模式 | 1280×720 视口，画布 DPR 2.0 |
| 粒子数、质量档位 | 32,768 |
| 场景、预热与测量时长 | 成形后（t≈12s）进行交互测试 |
| 平均 FPS / P95 帧时间 | 120 FPS（交互期间不掉帧） |
| 慢速靠近（0.44 世界单位/秒） | 指针停留处身体局部轻微形变（柔和凹陷），核心完整 |
| 高速划过（约 23 世界单位/秒） | 大范围驱散：身体大片被冲开、核心出现缺口、外围呈方向性拖尾 |
| 反应延迟 | 感知速度与原始速度 visibly 不同步（tau 实测生效），冲击在划过后短暂延续 |

## 过程中发现并修复的问题

1. 合成/自动化指针事件可能不触发 pointerenter，导致 inCanvas 保持 false、力场不激活；onMove 中补记在场状态。
2. 截图管线有数百毫秒延迟，快速交互的瞬间需「事件后立即截图」并配合引擎状态读取（pointerVel 实测 23.4 世界单位/秒）判断，避免误判力场未生效。
3. 初版冲击强度视觉过弱：影响半径 2.2→2.6，冲击项等效冲量 ×3。

## 体验结论与后续

- Phase 5 完成条件达成：慢速靠近与高速划过差异清晰可辨，反应延迟生效。
- 下一阶段：Phase 6 驱散与重新聚合——冲击触发散开脉冲并暂时降低锚点刚度，核心保留、旋涡式回归、目标 2–4 秒自然重组（本阶段实测重组偏快，正是 Phase 6 的交付内容）。
