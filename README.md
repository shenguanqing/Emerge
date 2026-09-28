# Emerge · Particle Life

一个由 GPU 粒子构成、具有自主行为与情绪反馈的抽象数字生命体。

> 粒子本身就是生命体。

它通过呼吸、流动、迟疑、躲避和重新凝聚，让用户感受到一个未知生命正在回应自己。视觉追求极简、神秘、有机与克制的科幻感。

## 当前状态

仓库已完成需求与技术规划文档初始化，**尚未实现可运行的 Prototype**。当前没有安装、开发或构建命令；进入 Phase 1 后随真实工程补充。

项目名为 Emerge，产品方向为 Particle Life / 粒子生命体。首阶段面向 macOS、Windows 和 Web；iOS / Android 为后续扩展方向。

## MVP

- 一个生命体，20,000–100,000 个 GPU 粒子，包含 Core、Body、Aura。
- 呼吸、自主 Idle、Flow Field / Curl Noise，以及 Curious / Scared / Calm 连续过渡。
- 鼠标靠近、驱散与自然重新聚合，交互带有生物式反应延迟。
- Web Demo、透明桌面窗口与 FPS 自适应质量。

验收核心：即使没有账号、成长和音乐，用户也愿意观察并互动 5 分钟。若达不到，继续打磨生命感。

## 拟采用的技术

Vue 3、TypeScript、Three.js；桌面壳优先 Tauri 2；探索 WebGPU GPU Compute，准备 WebGL2 GPGPU 后备路径。版本及平台能力在工程初始化时验证，当前不承诺全部能力已可用。

## 文档导航

- [文档索引](docs/README.md)
- [产品定义与 MVP 边界](docs/PRODUCT.md)
- [技术架构与平台策略](docs/ARCHITECTURE.md)
- [视觉与交互规格](docs/VISUAL_INTERACTION.md)
- [分阶段开发路线](docs/ROADMAP.md)
- [验收与性能验证](docs/VALIDATION.md)
- [初始技术决策](docs/decisions/0001-technical-direction.md)
- [原始需求](docs/ORIGINAL_BRIEF.md)
- [协作约定](AGENTS.md) · [变更记录](CHANGELOG.md)
