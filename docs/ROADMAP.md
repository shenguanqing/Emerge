# 开发路线

当前进度：Phase 1–7 已完成并通过验证；Phase 8 部分通过（macOS 桌面窗口可运行，透明合成受 WKWebView 层限制，见 [reports/phase-8.md](reports/phase-8.md)）；Phase 9 进行中。

| 阶段 | 交付范围 | 完成条件 |
| --- | --- | --- |
| Phase 1 架构与渲染 Prototype（✅ 已完成） | Vue / TypeScript 工程，核心与渲染边界，最小粒子画面、能力探测 | Web 可运行；记录 WebGPU / WebGL2 可用性；建立真实启动和验证命令 |
| Phase 2 GPU Particle Simulation（✅ 已完成） | GPU 位置/速度更新，双缓冲、时间步、资源释放与后备路径 | 至少 20k 粒子稳定模拟；两种后端分别验证或明确阻塞 |
| Phase 3 基础形态（✅ 已完成） | Core / Body / Aura、呼吸、启动凝聚 | 三层可辨，有有机轮廓；不呈现普通发光球 |
| Phase 4 Flow Field / Curl Noise（✅ 已完成） | 相关流动、局部扰动与阻尼 | 长时间运动不散架，避免固定循环与随机乱飞 |
| Phase 5 Pointer Force Field（✅ 已完成） | 指针坐标、速度、靠近感知、反应延迟与冲击 | 慢速靠近与高速划过有可辨差异 |
| Phase 6 驱散与重新聚合（✅ 已完成） | 核心保留、旋涡式回归与拖尾 | 目标 2–4 秒自然重组，无位置瞬移 |
| Phase 7 Behavior / Emotion（✅ 已完成） | 自主 Idle，Curious / Scared / Calm，连续参数 | 平滑转换，受惊后短期安全距离增加，无需用户输入仍有生命感 |
| Phase 8 透明桌面窗口（⚠️ 部分通过） | Tauri 2，macOS / Windows 透明无边框，基础交互与退出入口 | macOS：窗口/置顶/交互/退出 ✅，透明合成 ⚠️（WKWebView 层限制，诊断与 workaround 已记录）；Windows：未验证 |
| Phase 2 GPU Particle Simulation | GPU 位置/速度更新，双缓冲、时间步、资源释放与后备路径 | 至少 20k 粒子稳定模拟；两种后端分别验证或明确阻塞 |
| Phase 3 基础形态 | Core / Body / Aura、呼吸、启动凝聚 | 三层可辨，有有机轮廓；不呈现普通发光球 |
| Phase 4 Flow Field / Curl Noise | 相关流动、局部扰动与阻尼 | 长时间运动不散架，避免固定循环与随机乱飞 |
| Phase 5 Pointer Force Field | 指针坐标、速度、靠近感知、反应延迟与冲击 | 慢速靠近与高速划过有可辨差异 |
| Phase 6 驱散与重新聚合 | 核心保留、旋涡式回归与拖尾 | 目标 2–4 秒自然重组，无位置瞬移 |
| Phase 7 Behavior / Emotion | 自主 Idle，Curious / Scared / Calm，连续参数 | 平滑转换，受惊后短期安全距离增加，无需用户输入仍有生命感 |
| Phase 8 透明桌面窗口 | Tauri 2，macOS / Windows 透明无边框，基础交互与退出入口 | 两平台验证透明合成与输入；记录置顶、穿透等扩展控制的支持情况 |
| Phase 9 性能优化 | 自适应档位、低功耗、隐藏/恢复、资源稳定性 | 记录目标设备 FPS 和功耗观察；完成 MVP 体验验收 |
| Phase 10 后续系统 | DNA、成长、记忆、现实时间/离线、音乐、完整观察空间、分享及同步 | 每项独立设计与验证；不得一次性展开全部功能 |

## Phase 1 的下一步

1. 确认依赖版本和 GPU 后端整合方式，补充技术决策实测结果。
2. 初始化可运行的 Web 工程，创建最小核心状态与渲染生命周期。
3. 展示最小 GPU 粒子 Prototype，提供后端和帧率诊断入口。
4. 验证挂载、卸载、缩放与资源释放，记录运行命令及已知限制。

桌面透明窗口正式交付在 Phase 8，但高风险的 WebView / GPU / alpha 能力可在早期做最小验证，避免架构建立在未验证假设上。

## 每阶段的交付记录

使用 [阶段交付记录模板](PHASE_REPORT_TEMPLATE.md) 保存实际结果。

记录交付内容、实际运行方式、验证环境、测试与视觉结果、未验证项和下一阶段范围。只把有实现且验收过的功能标记为完成。若核心五分钟体验不成立，优先回到形态、运动和交互打磨。
