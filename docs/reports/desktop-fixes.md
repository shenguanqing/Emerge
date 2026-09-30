# 桌面问题修复验证

- 日期：2026-09-29
- 环境：MacBook Pro（MacBookPro18,3）、Apple M1 Pro、16 GB、macOS 15.7.9。
- 构建：本地 debug .app；未发布、未升级依赖。

## 修复原因

1. 页面透明规则只覆盖 html/body，`#app` 仍为黑色；WebGPU 初始化还漏传透明参数。
2. 顶部拖动区域未授予 `core:window:allow-start-dragging` 权限。
3. 桌面 WebGL 原画布隐藏后，另建的覆盖画布遮挡输入；移除复制绕行，恢复同一画布的渲染与输入。
4. WebGL 速度着色器重复声明 uniform；WebGPU 使用默认参数而 WebGL 使用部分 DNA 参数，模拟参数也未正确传入；统一传入 DNA 初始化后的参数。
5. 系统音频从未实现，原代码只有页面音乐文件输入。本次新增 macOS ScreenCaptureKit 适配。
6. Tauri 开发配置没有 devUrl，可能运行旧 dist；现开发模式自动启动 Vite，构建自动更新前端。

## 已执行

- `npm run build`：类型检查、生产构建通过。
- `npm run test:core`：10 项通过，含停止音频后的节拍衰减回归测试。
- `npm exec tauri build -- --debug --bundles app`：Swift 静态库、Rust 链接、.app 构建通过。
- Chrome 页面实际观察 WebGPU 与强制 WebGL2：两者均显示粒子形体；同一浏览器存档 Life ID 相同，40,960 粒子。未做逐像素一致性比较。
- 桌面 WKWebView 使用 WebGL2，460×460 CSS 像素，DPR 2；实际观察粒子与控件，初始约 27,853 粒子，自动质量可升至约 85k。诊断显示的 FPS 为原有 RAF 统计，不作为实际 GPU 性能基准。
- 桌面顶部发送拖动操作后仍正常运行；缺少窗口位置前后量化证据，拖动最终效果待确认。
- 修复后窗口截图没有原黑色矩形；截取窗口时背景表现为白色，不能仅凭这一截图宣称桌面合成完全通过，仍需背景叠放检查。
- 点击系统声音入口可触发原生捕获；初次失败路径能显示错误。系统设置中 Emerge 开关开启，但新构建返回 TCC 拒绝；正在通过系统 UI 刷新授权，macOS 要求用户触控 ID 验证。

## 待补充

授权后的音频能量与停止释放、实际音乐响应、透明叠放与拖动位置验证。Windows、长时稳定性、真实渲染 FPS 与功耗未测。两端 localStorage 独立，桌面新生阶段与 Web 成熟阶段不能视为渲染不一致的证据。

## 系统音频 TCC 修复（续）

- 原因：`Info.plist` 缺少 `NSScreenCaptureUsageDescription`；直接运行 `target/debug/emerge` 时可执行文件没有绑定 Info.plist，TCC 读不到用途描述；错误文案把原生 TCC 信息再包一层，难以操作。
- 处理：补 `src-tauri/Info.plist` 并合并进 `.app`；`build.rs` 用 `-sectcreate __TEXT __info_plist` 嵌入裸二进制；Swift 捕获前调用 `CGPreflightScreenCaptureAccess` / `CGRequestScreenCaptureAccess`；Rust 透传原因；前端增加「打开隐私设置」。
- 验证：`npm run build`、`npm run test:core` 10/10、`tauri build --debug --bundles app` 通过；`.app` Info.plist 已含用途描述，裸二进制 `__TEXT,__info_plist` 含同一描述；进程可启动。真实 TCC 授权与音频能量需用户侧确认。
- 注意：ad-hoc 开发构建每次重编译后 CDHash 变化，若设置里开关已开仍失败，需关闭再打开一次并重启应用。
