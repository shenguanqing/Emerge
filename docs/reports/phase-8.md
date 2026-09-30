# Phase 8 交付记录：透明桌面窗口

## 范围与状态

- 阶段：Phase 8；日期：2026-09-28；对应提交：Phase 8 交付提交。
- 本阶段实际交付：
  - Tauri 2 桌面壳（src-tauri）：无边框、置顶、可缩放窗口，frontendDist 嵌入，debug 构建可运行。
  - 桌面透明模式：检测 Tauri 环境 → 页面/画布切换透明路径（WebGL2 alpha + 2D 画布中转合成）。
  - **WKWebView 透明合成 workaround**：WebGL 层不参与 WKWebView 页面透明合成（黑底），实现 GL 画布（preserveDrawingBuffer + display:none）→ `drawImage` → 透明 2D overlay 画布的中转合成，实测页面内容（粒子与 DOM）可透过窗口合成。
  - macOS 窗口层的 ObjC 修正（objc2）：NSWindow `setOpaque:NO` + `setBackgroundColor:clearColor`；WKWebView 实例私有 `_setDrawsBackground:`（先 respondsToSelector 守卫，回退 KVC）。
  - 桌面诊断信标：桌面模式下周期性上报运行状态（后端/FPS/情绪/错误/窗口坐标/计算样式），供自动化验证。
- 完成状态：部分通过（macOS 可运行、浮窗、交互 ✅；**透明合成未达成** ⚠️；Windows 未验证）。
- 未完成项：透明合成最后一层（见下方诊断）；Windows 平台验证（本环境无 Windows）；鼠标穿透、位置锁定、双模式切换 UI（记录为后续，Tauri API 存在）。
  - 后续补充（见 ROADMAP）：鼠标穿透、桌面位置锁定、设置窗已在后续迭代交付；本报告仅记录 Phase 8 当时状态。

## 运行与检查

- `npm run app:build`（= `npm run build && tauri build --debug --no-bundle`）→ `src-tauri/target/debug/emerge`。
- 自动化检查：vue-tsc + vite build 通过；cargo 编译通过。
- 实测：应用启动后浮于其他窗口之上，生命体凝聚、呼吸、状态切换（诊断信标显示 平静/好奇/受惊 随交互变化）、60 FPS、无 JS/GPU 错误；macOS 菜单栏含标准退出入口（emerge → Quit）。

## 验证环境与结果

| 项目 | 实际记录 |
| --- | --- |
| 系统 | macOS 15.7.9，Apple M1 Pro（16 GB），双显示器 |
| WebView | WKWebView（系统 WebKit，UserAgent AppleWebKit/605.1.15） |
| GPU 后端 | WebGL2 GPGPU（WKWebView 无 WebGPU，后备路径按设计生效）✅ |
| 粒子数 / FPS | 32,768 / 60 FPS（WKWebView 上限）✅ |
| 交互与情绪 | 诊断信标实测 mood 平静→好奇→受惊变化 ✅ |
| 窗口 | 无边框 ✅ 置顶 ✅ 自由移动 ✅ 浮于其他应用之上 ✅ |
| 透明合成 | **失败**：窗口基底不透明（黑底）。诊断链见下 ⚠️ |
| Windows | 未验证（无 Windows 环境）⚠️ |

## 透明合成诊断链（供上游跟进）

1. `transparent: true` 未启用私有 API 时 wry 明确告警；启用 `macOSPrivateApi` 后告警消失，但窗口仍黑。
2. 页面层验证为透明：`getComputedStyle` 显示 html/body 均为 rgba(0,0,0,0)；纯 2D 红色矩形可透过窗口合成 ✅。
3. WebGL 画布层在 WKWebView 中合成失败（黑底）——已用 2D overlay 中转绕过，粒子可透过 ✅。
4. 隐藏 overlay 后窗口仍为纯黑 → 黑底位于 **WKWebView/窗口基底层**，与页面内容无关。
5. 已尝试：NSWindow `setOpaque:NO` + clearColor、WKWebView 实例 KVC `drawsBackground=false`（新版 WKWebView 抛 ObjC 异常导致 abort，已用 `_setDrawsBackground:` + respondsToSelector 守卫解决）、`set_background_color(Color(0,0,0,0))`（wry 0.57 运行时路径会设置实例 KVC 与 underPageBackgroundColor）——组合后窗口基底仍为黑。
6. wry 0.57 源码确认：macOS 创建路径从未调用 webview 实例 `setOpaque(false)`（该调用仅存在于 iOS 分支），config 层 KVC 在当前 WKWebView 上不生效。
7. 结论：需要 wry/WebKit 层的进一步处理（如容器 NSView 背景与 WKWebView layer 的完整清除）。应用侧 workaround（overlay 合成）已就绪，基底层一旦透明即可达成完整效果。

## 过程中发现并修复的问题

1. 生成 Tauri 图标缺失导致编译失败 → `tauri icon` 生成全套。
2. 无边框窗口默认位置落在坐标系角落（WebKit screenX/screenY 语义混淆）→ Rust setup 强制 `set_position`。
3. KVC `drawsBackground` 在新版 WKWebView 抛 ObjC 异常（Rust 侧表现为 non-unwinding panic）→ 改用私有方法 + respondsToSelector 守卫。
4. `set_background_color` 在 overlay 就绪前测试会掩盖真实黑底来源，导致一轮误判；二分定位（隐藏 overlay）澄清。

## 闭环复查（同日补充）

应用侧全部手段用尽后做了决定性二分：页面绘制「左半不透明绿色 / 右半完全透明」——左半完美合成到屏幕，右半显示黑色而非窗口背后的应用。证实黑底位于 WKWebView/窗口基底层，与页面内容无关。此前所有修正（NSWindow setOpaque:NO + clearColor、WKWebView 实例 setOpaque:false + _setDrawsBackground:NO + underPageBackgroundColor clearColor、tao 窗口路径、config KVC）全部生效但基底仍黑。

- 升级检查：wry 0.57.0 已是 crates.io 最新（2026-09-08 发布），无升级空间。
- 结论：上游缺陷。已提交 issue 并附完整证据：**[tauri-apps/wry#1867](https://github.com/tauri-apps/wry/issues/1867)**。
- Windows（WebView2）透明路径预期不受此 WKWebView 缺陷影响；本环境无 Windows，待用户在 Windows 上按 README 步骤验证。
- 后续跟进：关注上游 issue 修复；修复后应用侧无需改动（overlay 合成与页面透明已就绪）。

## 体验结论与后续

- 桌面模式当前形态：深色「观察窗」内呈现生命体，浮于桌面，可交互。透明合成是上游缺陷，不影响其余系统推进。
- 下一阶段：Phase 9 性能优化——自适应档位（Low/Medium/High/Ultra）、闲置降帧 60→30→15、隐藏/最小化节流与资源稳定性。
