# Phase 7 交付记录：Behavior / Emotion

## 范围与状态

- 阶段：Phase 7；日期：2026-09-28；对应提交：Phase 7 交付提交。
- 本阶段实际交付：
  - EmotionEngine（core，纯 TS）：连续参数 energy / curiosity / trust / stress / sleepiness / activity / mood，全部指数滞后更新，无瞬间切换；自主节律（能量慢周期漂移 + 9–20 秒随机自发脉冲）。
  - BehaviorEngine（core，纯 TS）：状态为连续权重而非互斥片段——scared=smoothstep(stress)、curious=smoothstep(curiosity)×(1−scared)、calm=其余；受惊收缩 contract（快收慢放，驱动身体锚点收缩）；好奇趋近（核心向指针试探移动 ≤30% 距离）；受惊回避（核心向反方向退避）；pointerPushMul（信任×好奇 → 温和靠近，排斥降低；受惊 → 加强保持距离）。
  - 渲染接入（两后端一致）：uContract 身体收缩、uEnergy 调制流场强度、uMoodShift 核心色温微移（克制幅度）；uPointerPushMul 指针排斥乘数。
  - 诊断条新增状态显示：平静 / 好奇 / 警觉 / 受惊（主导权重标签）。
- 完成状态：通过（WebGPU 与 WebGL2 语义一致，主验证在 WebGPU；截图验证在 WebGL2）。
- 未完成项：Sleep / Playful / Lonely / Explore 等扩展行为与 DNA 接管情绪基线属 Phase 10；sleepiness 目前为低位慢漂移（现实昼夜属 Phase 10）。

## 运行与检查

- 命令同前；`npm run build` 通过。
- 实测方法：页面内合成指针事件 + `window.__emergeEngine.state` 按模拟时间采样；诊断条状态标签目测。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统、设备与 GPU | macOS 15.7.9，Apple M1 Pro（16 GB） |
| 浏览器 / WebView 与版本 | ZCode 3.14.3 内置浏览器（Chromium 146 / Electron 41） |
| GPU 后端 | WebGPU Compute 主验证；WebGL2 截图验证（受惊收缩画面一致） |
| 粒子数 | 32,768 |
| 自主 Idle（无输入 24 秒采样） | 核心自主游移 0.28 世界单位；energy 起伏 0.28；状态保持「平静」——无输入仍有生命感 ✅ |
| 好奇（指针缓慢接近并徘徊 10 秒） | curious 权重 0→1.0，核心向指针偏移（实测 core 移至指针方向），标签「好奇」，scared 保持 0 ✅ |
| 受惊（高速强冲击） | scared 0.85、contract 0.72 峰值、stress 0.63；身体明显收缩为致密团块（截图），标签「受惊」 ✅ |
| 平滑恢复曲线 | scared 0.11→0.82→0.16→0.01、contract 0.01→0.72→0.49→0.2→0.07（1.6–6.4 秒，指数平滑无跳变） ✅ |
| FPS | 120 FPS |

## 过程中发现并修复的问题

1. 引擎补丁顺序引入的两个编译期问题（EmotionInputs 缺 dt、WebGL2 params 属性缺失）——vue-tsc strict 拦截，当场修复。

## 体验结论与后续

- Phase 7 完成条件达成：Curious / Scared / Calm 连续权重平滑转换、受惊后短期安全距离增加（wary + 回避偏置）、无输入仍有生命感。
- 下一阶段：Phase 8 透明桌面窗口——Tauri 2、macOS/Windows 透明无边框、基础交互与退出入口。
