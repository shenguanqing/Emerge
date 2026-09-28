# ADR 0001：初始技术方向与模块边界

- 日期：2026-09-28
- 状态：拟采用，等待 Prototype 验证

## 背景

项目需要共享 macOS、Windows 与 Web 的粒子生命体验，支持 GPU 大规模模拟，同时让生命逻辑未来可以复用于移动端或其他渲染器。

## 决策

优先采用 Vue 3 + TypeScript 构建界面，Three.js 负责渲染，Tauri 2 提供桌面能力。优先探索 WebGPU Compute，使用 WebGL2 GPGPU 作为后备。核心生命逻辑保持纯 TypeScript，不依赖渲染器和平台。

MVP 使用 20k–100k 粒子，先完成形态、运动和交互；暂不引入账号、云同步、音乐、完整成长和 Rapier。大规模粒子不使用 DOM 或逐粒子 CPU 模拟。

## 取舍

共享核心和前端可降低多平台重复开发，但桌面 WebView 的 GPU 支持和透明合成不能由普通浏览器测试代替。双 GPU 后端提高覆盖面，也增加 Shader 实现、资源管理和视觉校准成本。核心契约保持统一，允许后端在质量上合理降级。

## 转为已验证前的检查

- 固定并记录依赖版本，验证 Three.js 与两类模拟后端的集成路径。
- 验证目标 macOS / Windows WebView 的 GPU 能力和透明 alpha 后处理。
- 验证最低粒子预算、资源释放和质量调节的可行性。
- 明确穿透模式下的鼠标感知限制、恢复交互与退出入口。

如验证失败，记录证据、替代方案与对平台范围的影响，再修订本决策。

## 实测补充（2026-09-28，Phase 8）

- macOS 桌面窗口（Tauri 2 + WKWebView）已实测：无边框置顶浮窗、WebGL2 后备路径 60 FPS、交互正常。透明合成受阻于 WKWebView 基底层——应用侧全部文档路径与私有 API（NSWindow/tao 层、实例 _setDrawsBackground:、underPageBackgroundColor）均已清除但基底仍黑；二分实验证明与页面内容无关。已确认 wry 0.57.0 为最新并提交上游 issue [tauri-apps/wry#1867](https://github.com/tauri-apps/wry/issues/1867)。
- Windows（WebView2）透明路径不受该 WKWebView 缺陷影响，待 Windows 环境验证。
- Web 端（Chrome WebGPU / WebGL2）不受影响。
