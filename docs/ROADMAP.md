# 开发路线

当前进度：**MVP（Phase 1–9）已交付**。Phase 1–7 与 9 完成并通过验证；Phase 8 部分通过（macOS 桌面窗口可运行，透明合成受 WKWebView 层限制，见 [reports/phase-8.md](reports/phase-8.md)）。Phase 10 为后续系统，按原始需求在 MVP 验收后再启动。

| 阶段 | 交付范围 | 完成条件 |
| --- | --- | --- |
| Phase 1 架构与渲染 Prototype（✅ 已完成） | Vue / TypeScript 工程，核心与渲染边界，最小粒子画面、能力探测 | Web 可运行；记录 WebGPU / WebGL2 可用性；建立真实启动和验证命令 |
| Phase 2 GPU Particle Simulation（✅ 已完成） | GPU 位置/速度更新，双缓冲、时间步、资源释放与后备路径 | 至少 20k 粒子稳定模拟；两种后端分别验证或明确阻塞 |
| Phase 3 基础形态（✅ 已完成） | Core / Body / Aura、呼吸、启动凝聚 | 三层可辨，有有机轮廓；不呈现普通发光球 |
| Phase 4 Flow Field / Curl Noise（✅ 已完成） | 相关流动、局部扰动与阻尼 | 长时间运动不散架，避免固定循环与随机乱飞 |
| Phase 5 Pointer Force Field（✅ 已完成） | 指针坐标、速度、靠近感知、反应延迟与冲击 | 慢速靠近与高速划过有可辨差异 |
| Phase 6 驱散与重新聚合（✅ 已完成） | 核心保留、旋涡式回归与拖尾 | 目标 2–4 秒自然重组，无位置瞬移 |
| Phase 7 Behavior / Emotion（✅ 已完成） | 自主 Idle，Curious / Scared / Calm，连续参数 | 平滑转换，受惊后短期安全距离增加，无需用户输入仍有生命感 |
| Phase 8 透明桌面窗口（⚠️ 部分通过） | Tauri 2，macOS / Windows 透明无边框，系统托盘（显示/隐藏/置顶/穿透/退出），窗口位置记忆 | macOS：托盘/置顶/穿透开关/交互/退出/位置记忆 ✅，透明合成 ⚠️（上游缺陷 [wry#1867](https://github.com/tauri-apps/wry/issues/1867)，诊断与应用侧 workaround 已记录）；Windows：待用户在 Windows 环境验证 |
| Phase 9 性能优化（✅ 已完成） | 自适应档位、低功耗、隐藏/恢复、资源稳定性 | Ultra 100k @ 120 FPS；四档滞回升降档；闲置 60→30→15 低功耗调度 |
| Phase 10a 生命闭环（✅ 已完成） | DNA、成长、记忆、现实时间/离线、持久化（LifeStorage） | 核心测试 9/9；DNA 持久化与刷新一致；成长/双核/环/昼夜/离线问候截图可辨 |
| Phase 10b-1 音乐响应（✅ 已完成） | 文件输入 → Bass/Mid/Treble/Beat/能量 → 行为参数（身体脉冲/能量波/兴奋） | 合成节拍音端到端验证；Web 系统音频受浏览器安全模型限制（记录） |
| Phase 10b-2 后续批次（未开始） | 桌面系统音频捕获（WASAPI/权限）、完整观察空间 UI、跨设备同步与分享 | 每项独立设计与验证；不得一次性展开全部功能 |

## MVP 验收标准

打开应用后，即使没有账号、设置、成长、音乐、任务、商城，用户也愿意观察并互动 5 分钟。若不成立，暂停功能扩张，回到形态、运动、交互打磨（见 [VALIDATION.md](VALIDATION.md) 的 MVP 体验验收）。

## 已知限制与后续跟进

- macOS 桌面透明合成的最后一层受阻于 WKWebView（黑底），完整诊断链与应用侧 workaround 见 [reports/phase-8.md](reports/phase-8.md)；Windows（WebView2）路径预期不受影响，待验证。
- Phase 8 的鼠标穿透、位置锁定、双模式切换 UI 未实现（Tauri API 存在，逐项验证后推进）。

## 每阶段的交付记录

使用 [阶段交付记录模板](PHASE_REPORT_TEMPLATE.md) 保存实际结果。

记录交付内容、实际运行方式、验证环境、测试与视觉结果、未验证项和下一阶段范围。只把有实现且验收过的功能标记为完成。若核心五分钟体验不成立，优先回到形态、运动和交互打磨。
