# 开发路线

当前进度：**MVP（Phase 1–9）与生命闭环（Phase 10a）、音乐响应（Phase 10b-1）已交付**。Phase 1–7 与 9 完成并通过验证；Phase 8 macOS 复测通过（透明合成在 macOS 15.8.1 达成，见 [reports/phase-8-macos-retest.md](reports/phase-8-macos-retest.md)；历史诊断见 [reports/phase-8.md](reports/phase-8.md)），Windows 仍待验证。Phase 10b-1 的桌面真实系统音频用户已实测可用。Phase 10b-2 进行中：观察空间 v1 已交付，WASAPI 与跨设备同步/分享未开始。

| 阶段 | 交付范围 | 完成条件 |
| --- | --- | --- |
| Phase 1 架构与渲染 Prototype（✅ 已完成） | Vue / TypeScript 工程，核心与渲染边界，最小粒子画面、能力探测 | Web 可运行；记录 WebGPU / WebGL2 可用性；建立真实启动和验证命令 |
| Phase 2 GPU Particle Simulation（✅ 已完成） | GPU 位置/速度更新，双缓冲、时间步、资源释放与后备路径 | 至少 20k 粒子稳定模拟；两种后端分别验证或明确阻塞 |
| Phase 3 基础形态（✅ 已完成） | Core / Body / Aura、呼吸、启动凝聚 | 三层可辨，有有机轮廓；不呈现普通发光球 |
| Phase 4 Flow Field / Curl Noise（✅ 已完成） | 相关流动、局部扰动与阻尼 | 长时间运动不散架，避免固定循环与随机乱飞 |
| Phase 5 Pointer Force Field（✅ 已完成） | 指针坐标、速度、靠近感知、反应延迟与冲击 | 慢速靠近与高速划过有可辨差异 |
| Phase 6 驱散与重新聚合（✅ 已完成） | 核心保留、旋涡式回归与拖尾 | 目标 2–4 秒自然重组，无位置瞬移 |
| Phase 7 Behavior / Emotion（✅ 已完成） | 自主 Idle，Curious / Scared / Calm，连续参数 | 平滑转换，受惊后短期安全距离增加，无需用户输入仍有生命感 |
| Phase 8 透明桌面窗口（macOS ✅ / Windows 待验证） | Tauri 2，macOS / Windows 透明无边框，系统托盘（显示/隐藏/置顶/穿透/退出），窗口位置记忆 | macOS：托盘/置顶/穿透/交互/退出/位置记忆 ✅，透明合成 ✅（2026-09-30 在 macOS 15.8.1 复测通过，见 [reports/phase-8-macos-retest.md](reports/phase-8-macos-retest.md)；15.7.9 时期黑底与 wry#1867 诊断保留在 [reports/phase-8.md](reports/phase-8.md)）；Windows：待用户在 Windows 环境验证 |
| Phase 9 性能优化（✅ 已完成） | 自适应档位、低功耗、隐藏/恢复、资源稳定性 | Ultra 100k @ 120 FPS；四档滞回升降档；闲置 60→30→15 低功耗调度 |
| Phase 10a 生命闭环（✅ 已完成） | DNA、成长、记忆、现实时间/离线、持久化（LifeStorage） | 核心测试 9/9；DNA 持久化与刷新一致；成长/双核/环/昼夜/离线问候截图可辨 |
| Phase 10b-1 音乐响应（✅ 已完成；macOS 真实系统音频用户实测可用） | 文件输入 → Bass/Mid/Treble/Beat/能量 → 行为参数（身体脉冲/能量波/兴奋） | 合成节拍音端到端验证；Web 系统音频受浏览器安全模型限制（记录）；macOS 授权后真实响应用户实测可用，长时带时间戳观察记录待补（非阻塞） |
| Phase 10b-2 后续批次（进行中） | 桌面系统音频捕获（WASAPI/权限）、完整观察空间 UI、跨设备同步与分享 | 每项独立设计与验证；不得一次性展开全部功能。**观察空间 v1 已交付（双击进入/旋转缩放/生命信息）**，见 [reports/phase-10b-2a-observatory.md](reports/phase-10b-2a-observatory.md)；WASAPI 与同步分享未开始 |

## MVP 验收标准

打开应用后，即使没有账号、设置、成长、音乐、任务、商城，用户也愿意观察并互动 5 分钟。若不成立，暂停功能扩张，回到形态、运动、交互打磨（见 [VALIDATION.md](VALIDATION.md) 的 MVP 体验验收）。

## 近期设计方向（已实现 v1）

四形态视觉体系已落地为 Origin「形成」→ Awaken「组织」→ Conscious「思考」→ Emerge「涌现」，共用悬浮粒子生命核心母体。成长计分与阈值不变；`GrowthEngine.FormStructure` + `HologramField` 多族锚点已实现，界面文案已切换。规格见 [decisions/0005-forms-origin-awaken-conscious-emerge.md](decisions/0005-forms-origin-awaken-conscious-emerge.md)。四档截图见 `output/playwright/form-*.png`。**仍待打磨**：Conscious/Emerge 细节密度与参考图量级、桌面窗内观感、WebGPU 与 WebGL2 美学对照。

## 已知限制与后续跟进

- macOS 透明合成曾在 15.7.9 受阻于 WKWebView 基底黑底（[wry#1867](https://github.com/tauri-apps/wry/issues/1867)，完整诊断见 [reports/phase-8.md](reports/phase-8.md)）。2026-09-30 在 macOS 15.8.1 复测通过，应用侧 objc 强制层已不在源码中仍可达成透明；更旧 macOS 是否复现未测。Windows（WebView2）路径待验证。
- 鼠标穿透、桌面位置锁定、设置窗（外观/行为/成长说明）已在 macOS 交付；原生设置窗叠放与 Cmd+, 入口在 2026-09-30 续验中未复测通过，见 [reports/existing-features-review.md](reports/existing-features-review.md)。

## 未验证项（功能已实现，验收未完成）

| 项目 | 现状 | 需要的验证 |
| --- | --- | --- |
| 桌面真实系统音频 | macOS ScreenCaptureKit + TCC 链路已实现；用户反馈授权后实测可用 | 仍缺一次带时间戳的长时观察记录（非阻塞） |
| 原生设置窗口 | UI 已按 Claude 规范重做，浏览器路径已验证；用户反馈可用 | Tauri WebView 内 420×720 窗口、滚动、深浅色、Cmd+, 与托盘入口的正式验收记录 |
| 成熟形态视觉 | **2026-09-30 结构验收通过**：初生/成形/环生/双核参数与画面一致，WebGPU 与 WebGL2 同结构族（[reports/mature-form-visual-acceptance.md](reports/mature-form-visual-acceptance.md)） | 仍缺：不同屏幕尺寸、桌面原生窗内观感、火花样式人工美学确认、真实多日养成对比 |
| Windows 全线 | 代码路径在，本环境无 Windows | Phase 8 窗口/穿透/托盘、WASAPI 系统音频 |
| macOS 透明合成 | **2026-09-30 在 macOS 15.8.1 复测通过**（[reports/phase-8-macos-retest.md](reports/phase-8-macos-retest.md)） | 若需支持更旧 macOS，回归 15.7.x 是否再现黑底 |

以上项目在验收完成前不得在文档中写成「已验证」；macOS 透明合成可在注明复测环境的前提下记为通过。

## 每阶段的交付记录

使用 [阶段交付记录模板](PHASE_REPORT_TEMPLATE.md) 保存实际结果。

记录交付内容、实际运行方式、验证环境、测试与视觉结果、未验证项和下一阶段范围。只把有实现且验收过的功能标记为完成。若核心五分钟体验不成立，优先回到形态、运动和交互打磨。

## 2026-10-01 续验与实现

观察空间已新增文件音乐选择、播放/暂停/停止及 macOS 系统声音按钮，并与托盘共用开关。macOS 应用菜单设置和观察空间入口已实际打开，设置深色与滚动、原生观察空间复位和关闭已检查；后续实测 Cmd+, 与 Cmd+O 均可打开对应窗口；原生自动化双击进入/退出和空白不误触也通过，真实穿透到背后应用及全局 CG 输入仍待人工确认。

四形态调整为粒子光丝、共享神经路径与更少的断续轨道；WebGPU 四阶段已实际运行，Conscious/Emerge 的 20% 尺寸双后端已截图。两小时资源采样因目标进程退出在约 5 分钟后中止，尚未完成；功耗、真实休眠、多日成长和五分钟真人体验不标记为通过。详细结果与边界见 [2026-10-01 验收](reports/acceptance-2026-10-01.md)。本节更新此前表格中的观察空间音乐状态，不改变历史验收环境。


### 生命感反馈后的调整

用户认为光丝版仍 boring、不够智体，视觉定稿与真人生命感仍未通过。已加入 DNA 种子驱动的注意方向、局部信号传播与不等时长的组织/停顿节律，并修复观察空间系统监听期间的文件控制互斥。双 GPU 后端短时运行和 33 项回归通过；权限成功、真实穿透落点、休眠、多日及长时采样结论仍待补充。见 [注意节律决策](decisions/0007-attention-rhythm.md)。


### 两小时观察与菜单栏避让结果

17:17–19:17 的新版主进程资源观察已完成：121 样本、无重启或缺失。主进程 RSS 84.88–109.63 MiB，末段略高于初段；不能替代独立 WebKit/GPU 内存和真实功耗验收。观察空间现已禁用监听期间的文件「停止」，并按系统工作区避开菜单栏及 Dock；原生标题可见与工作区计算测试通过。新签名构建的系统声音再报权限不足，成功复测及真人/跨日项目仍待补充。详见 [本日验收记录](reports/acceptance-2026-10-01.md)。
