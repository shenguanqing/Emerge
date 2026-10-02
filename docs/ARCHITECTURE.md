# 技术架构

本文维护模块职责、数据契约与平台适配约束；当前实现进度和未验证项见 [ROADMAP](ROADMAP.md)，依赖与双后端实测结果见 [CHANGELOG](../CHANGELOG.md)。实现存在不代表全部平台或 MVP 体验验收通过。

## 技术方向

| 领域 | 首选 | 约束 |
| --- | --- | --- |
| UI | Vue 3 + TypeScript | UI 不承担逐帧粒子更新 |
| 桌面 | Tauri 2 | 实测系统 WebView 的图形与透明窗口能力 |
| 渲染 | Three.js | 核心引擎不依赖它 |
| 模拟 | WebGPU Compute / WGSL | 能力探测后启用 |
| 后备 | WebGL2 GPGPU / GLSL | 使用纹理 ping-pong 保存位置与速度 |
| 碰撞 | 按需评估 Rapier | MVP 不默认引入 |

WebGPU 不可用时切换 WebGL2。两者均不可用时显示明确的不支持提示。后端共享力场和参数语义，不承诺逐像素一致；不假设 WGSL 可以直接用于 WebGL2。

## 目录结构

已有实现的模块组织；新增模块落码时同步本文，不为尚未实现的远期功能创建占位目录。

```text
src/
├── main.ts                     入口：按 window 参数挂载 App / SettingsPanel / WelcomePanel
├── App.vue                     主窗：生命体画布、观察空间、诊断条、调试面板
├── core/                       生命引擎与领域逻辑（纯 TypeScript，不依赖 DOM/GPU）
│   ├── LifeEngine.ts               模拟时钟与生命状态
│   ├── BehaviorEngine.ts           行为意图与注意
│   ├── EmotionEngine.ts            七参数情绪
│   ├── AttentionEngine.ts          注意方向与节律
│   ├── GrowthEngine.ts             成长与 FormStructure
│   ├── MemoryEngine.ts             记忆与性格
│   ├── DNAEngine.ts                永久 DNA 生成（mulberry32 确定性）
│   ├── LifeClock.ts                虚拟生命时钟（timelapse 加速）
│   ├── TimeSystem.ts               时间推进与每日重置
│   ├── PointerPerception.ts        指针感知换算
│   ├── QualityManager.ts           质量档位与滞回
│   ├── FramePacer.ts               帧调度
│   ├── LifeStorage.ts              存档持久化（schema 2）
│   ├── settings.ts                 外观与窗口设置
│   └── *.test.ts                   行为/注意力/生命周期回归（node --test）
├── render/
│   ├── HologramField.ts            四形态锚点场（飘带/轨道/脉络/膜/碎片/弧流）
│   ├── ViewState.ts                相机状态
│   ├── capability.ts               GPU 能力探测
│   └── backends/
│       ├── webgpu/                 WebGPU Compute 模拟与渲染
│       └── webgl2/                 WebGL2 GPGPU 后备
├── input/
│   ├── PointerSystem.ts            全局指针事件
│   └── AudioSystem.ts              音频特征（文件 / 系统频段）
├── platform/
│   └── desktop.ts                  Tauri 桥：窗口、事件、存储适配、原生能力探测
├── ui/
│   ├── Observatory.vue             观察空间
│   ├── SettingsPanel.vue           设置窗
│   ├── WelcomePanel.vue            首次引导窗
│   ├── SelectControl.vue           语言与主题的自绘下拉
│   ├── MusicControl.vue            音乐面板（挂载于观察空间）
│   ├── Diagnostics.vue             诊断条
│   ├── DebugPanel.vue              调试面板（时间加速）
│   ├── useSettingsSync.ts          跨窗口设置补丁与存储事件同步
│   └── usePaletteAccent.ts         强调色随生命体配色
└── i18n/
    ├── index.ts                    语言状态、插值与阶段名称
    └── messages.json               Vue 与 Rust 共用的中/英/日/韩词表
src-tauri/
├── src/
│   ├── main.rs                     窗口、托盘、菜单、生命周期
│   ├── audio.rs                    系统音频命令（启动/停止/读取/曲名）
│   ├── locale.rs                   原生四语与共享词表
│   └── pointer.rs                  全局指针与穿透
└── native/
    └── SystemAudio.swift           ScreenCaptureKit 捕获与曲名查询
```

## 职责与数据流

输入与时间 → 标准化感知事件 → LifeEngine → 行为/情绪连续参数 → GPU 力场与视觉参数 → 渲染。

- LifeEngine 管理模拟时钟与生命状态，不持有 GPU 资源。
- BehaviorEngine 决定注意目标、自主移动意图、反应延迟与状态权重。
- EmotionEngine 平滑更新 energy、curiosity、trust、stress、sleepiness、activity、mood；参数范围和单位在实现时集中定义。
- 渲染模块消费只读快照，持有 GPU 缓冲、纹理、着色器与后处理资源。
- PointerSystem 输出位置、速度、接近度、按压等事件；统一坐标与速度单位，避免不同分辨率下反应失衡。
- 平台适配器处理窗口、生命周期和能力报告；Web 不假装具备桌面穿透或系统置顶能力。
- UI 通过命令和状态快照连接引擎，不能直接改写粒子缓存。

依赖方向：UI / 平台组装各模块；输入与渲染适配核心契约。core 只依赖纯 TypeScript 数据与计算。首先定义最小契约，避免为远期功能提前创建大量抽象。

## 模拟方案

粒子保存位置、速度、种子和层级属性。Core / Body / Aura 使用不同的密度、力场权重与生命周期，但共享生命状态。

合力包含核心吸引、近域排斥、Curl Noise、流场、鼠标力场与阻尼。时间步设上限，恢复后不追赶积压帧，避免切回应用时粒子爆炸。

驱散时改变速度或施加脉冲；回归时渐变吸引和流场，形成旋涡式重组。核心保持可辨，不使用位置瞬移完成回归。形态锚点由 `HologramField` 生成，粒子以弹簧力、阻尼与交互力逼近目标位置——任何形态变化都走力场积分，不把位置直接赋值为目标。

禁止全粒子 O(N²) 邻域计算。MVP 优先采用局部场近似；真实邻域影响仅在空间划分与性能预算验证后加入。

## 桌面与 Web

桌面透明窗口需分别验证 macOS / Windows、WebGPU / WebGL2 的 alpha 合成与后处理。Web 首版使用黑色观察背景；桌面渲染避免 Bloom 产生黑底、方框或透明边缘脏色。

透明合成使用 Tauri 原生透明窗口配置，不调用未经验证的 Objective-C 私有选择器。系统版本的验证结果见 CHANGELOG，兼容限制与待测系统统一见 ROADMAP「已知坑」。

粒子主窗配置 `visibleOnAllWorkspaces: true`，在 macOS 通过系统 `CanJoinAllSpaces` 参与普通虚拟桌面；保留单一 WebView/GPU 生命周期，不监听切换后重新创建生命体或恢复另一份存档。置顶与穿透独立于桌面归属，设置/引导期间临时取消置顶不会清除此属性；托盘隐藏仍隐藏整个主窗。辅助窗口不启用跨桌面显示。当前 Tauri 对 Windows 的该属性无实现，不能据此声明 Windows 虚拟桌面支持；全屏应用 Space 与多显示器独立 Spaces 不由此配置自动保证。

系统音频由 ScreenCaptureKit 的 Swift 原生模块提供，构建期静态链接进应用（避免独立辅助进程的权限身份与生命周期问题）；只订阅音频不接收视频帧，滤波分离低/中/高频能量，仅向前端传标量。权限链路：`Info.plist` 打包并同步嵌入裸可执行文件（TCC 读取用途描述），捕获前显式请求「屏幕与系统音频录制」；开发构建 ad-hoc 签名在重编译后可能需要重新开关权限。系统「正在播放」曲名不使用 MediaRemote 私有 API，只查询已在运行的 Music / Spotify。

界面本地化由适配层负责，`core` 不依赖词表或 Vue。Rust `locale.rs` 在构建时嵌入前端同一份四语 JSON；语言选择独立保存中/英/日/韩，重建托盘/应用菜单时从原始生命状态和曲名重新格式化，保留声音勾选与文件互斥状态。Swift 音频失败回调传稳定错误代码和可选系统详情，由 Rust 按当前语言解释；不在 Swift 内硬编码中文产品提示。

欢迎窗接收 `ui-locale-changed` 更新其独立 i18n 状态，并在销毁时取消监听；异步注册在窗口销毁后完成时立即清理。设置与欢迎通过 `app-settings-changed` 字段补丁同步，浏览器同源窗口另接收 storage 事件。保存时合并最新持久化数据，只写本次实际编辑；设置窗保留本地尚未提交字段，远程回放不覆盖当前帧编辑。「恢复默认」明确提交完整默认值。渲染事件仍携带完整视觉参数，不把部分设置补丁直接传给 GPU 后端。

鼠标穿透时 WebView 可能无法收到指针事件；macOS 通过原生指针通道向前端传递感知，浏览器使用画布事件，不假定浏览器能持续获取桌面鼠标。退出与恢复交互通过原生菜单提供，各目标系统单独验证。

辅助窗口的物理位置/尺寸按该窗口自身的 `scale_factor` 转为全局逻辑坐标，欢迎窗排除区域不能借用主窗的 DPI；跨屏后的缩放在原生轮询中重新读取。

双击进入 Observatory 时协调单击波纹，防止双击被误判为连续惊吓。当前位置由设置/引导的摆放图保存比例坐标，核心锁定于该位置；长按用于粒子吸引，不作为桌面重新摆放入口。置顶/穿透偏好与设置、引导、观察空间的临时窗口状态分别处理。

## 质量与功耗

当前 Low / Medium / High / Ultra 档位控制活跃粒子数、点尺寸补偿与像素比上限；基础预算分别为 12,288 / 24,576 / 49,152 / 100,000，按成长度乘以 0.7–1.8 后封顶 100,000，点面积按数量差补偿。不将尚未接入档位控制的后处理、拖尾或模拟复杂度写为已实现。使用滑动窗口和升降档滞回，避免 FPS 波动导致反复切档。

目标：Apple Silicon Mac 活跃时 60 FPS；普通 Windows 集显至少 30 FPS。必须补充具体测试机型与分辨率后才可报告达标。

无交互时逐步从 60 → 30 → 15 FPS；交互后恢复活跃调度。隐藏、最小化和系统休眠时进一步节流或暂停。记录帧时间与功耗观察，不能仅靠降低粒子数判断低功耗有效。

## 数据与持久化

LifeStorage 使用带 schemaVersion 的生命快照（当前 schema 2），直接保存 DNA（含 Life ID/出生时间/种子）、聚合 memory 与 lastActiveTime；年龄、性格与形态由这些数据推导。外观和窗口偏好独立保存在 `emerge.settings`，语言/主题另有独立键；并非生命快照的字段。Web 与桌面均通过存储接口使用各自的 localStorage，不可用时回退内存，暂不提供跨环境同步。v1 存档原位迁移，保留 DNA 与按旧公式计算的成长下限，新增音乐/互动累计、每日额度与成长最高值；日期回拨不重复恢复额度。

成长只计可见时长（窗口显示状态 + document.hidden），不补发关闭、隐藏、休眠期间的时间。三条路径：陪伴（累计分钟 / 2400 + 使用日加成）、温和互动（仅邻近范围的真实低速动作与轻点后停留计分，快速划过不计）、音乐（连续两秒能量 > 0.04 后按时长累计，音量与节拍数不额外计分）。每日递减：互动前 20 分钟、音乐前 30 分钟全额，其后按 `L + 10 × (1 − exp(−(分钟 − L) / 30))` 收敛。音乐累计形成音乐亲和度、互动累计修正信任，两者调制响应而非计分倍率。

计分契约：`C` 为累计可见陪伴分钟，`D` 为使用日，`I` / `M` 为递减后的 `interactionCredit` / `musicCredit`。加权和为 `C / 2400 + clamp((D - 1) / 20, 0, 1) × 0.15 + I / 240 × 0.5 + M / 300 × 0.35`；成长度为 `clamp(max(growthFloor, 加权和 × (0.7 + 0.6 × clamp(growthBias, 0, 1))), 0, 1)`。历史最高值作为下限——DNA 只影响速度，任何 DNA 都可成熟。

不保存或同步逐帧 GPU 粒子状态。离线恢复使用受限时间推进而非逐帧追赶；处理时间倒退、超长离线与存档损坏。DNA 在创建后稳定保存，性能档位不能改写它。同步冲突、迁移与公开只读权限在对应阶段单独设计。
