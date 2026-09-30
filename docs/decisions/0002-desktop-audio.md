# 0002：桌面透明合成与系统音频适配

- 日期：2026-09-29
- 状态：已实现；权限描述与请求链路已修复，授权后实测待补充

桌面继续复用同一 Vue 页面与 GPU 后端，仅由平台决定透明清屏。去掉隐藏 WebGL 画布和逐帧复制到第二个 Canvas 的绕行，避免遮挡指针与 UI。使用 Tauri 自身透明窗口配置，不调用未经验证的 Objective-C 私有选择器。

macOS 系统音频由 ScreenCaptureKit 原生模块提供。Swift 静态库在 Cargo 构建阶段编译链接到应用，避免独立辅助进程的权限身份和生命周期问题。仅订阅音频，不接收视频帧；简单滤波分离低、中、高频能量，只向前端传递标量。前端沿用现有 MusicFeatures 行为通道，core 不调用原生 API。系统权限通过用户显式操作请求，拒绝时显示错误。

权限链路：`src-tauri/Info.plist` 写入 `NSScreenCaptureUsageDescription`，打包进 `.app`，同时通过 `-sectcreate __TEXT __info_plist` 嵌入裸可执行文件，避免直接运行 `target/debug/emerge` 时 TCC 读不到用途描述。捕获前调用 `CGPreflightScreenCaptureAccess` / `CGRequestScreenCaptureAccess`。开发构建 ad-hoc 签名在每次重编译后会改变 CDHash，若系统设置中开关已开启仍失败，需关闭再打开一次并重启应用；推荐用 `Emerge.app` 启动。

需要 Xcode Command Line Tools 和 macOS 13+ 才能使用系统音频；较老系统及其他平台明确返回不支持。Windows loopback 不在此次实现内。不同频段提取方式仅保证参数含义相同，不承诺与 Web Audio FFT 数值相等。
