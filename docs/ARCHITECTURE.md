# MVP 技术架构

状态：设计方案，尚未实现。依赖版本与具体 GPU API 在 Phase 1 验证后固定。

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

## 建议目录

以下为后续代码组织方案，本次不创建空实现。

```text
src/
  core/       LifeEngine, BehaviorEngine, EmotionEngine
              后续 GrowthEngine, MemoryEngine, DNAEngine
  render/     ParticleRenderer, CoreRenderer, AuraRenderer
              PostProcessing, shaders/, backends/
  input/      PointerSystem, TimeSystem；后续 AudioSystem
  platform/   DesktopAdapter, WebAdapter
  storage/    LifeStorage（持久化阶段引入）
  ui/         Observatory；后续 Settings
src-tauri/    桌面窗口配置与必要的原生能力
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

合力包含核心吸引、近域排斥、Curl Noise、流场、鼠标力场与阻尼。使用有上限的时间步与累积器，限制恢复后的补算，避免切回应用时粒子爆炸。

驱散时改变速度或施加脉冲；回归时渐变吸引和流场，形成旋涡式重组。核心保持可辨，不使用位置瞬移完成回归。

禁止全粒子 O(N²) 邻域计算。MVP 优先采用局部场近似；真实邻域影响仅在空间划分与性能预算验证后加入。

## 桌面与 Web

桌面透明窗口需分别验证 macOS / Windows、WebGPU / WebGL2 的 alpha 合成与后处理。Web 首版使用黑色观察背景；桌面渲染避免 Bloom 产生黑底、方框或透明边缘脏色。

鼠标穿透可能导致 WebView 无法收到指针事件，必须显式设计交互模式与穿透模式。恢复交互和退出入口应通过可访问的原生菜单等方式提供。全局鼠标感知如确有需要，在评估系统能力与权限后实现，不能假定浏览器能持续获取桌面鼠标。

双击进入 Observatory 时需协调单击波纹，防止双击被误判为连续惊吓。穿透、位置锁定、自由移动与模式切换采用独立状态，不混为同一开关。

## 质量与功耗

Low / Medium / High / Ultra 档位控制粒子预算、像素比、后处理、拖尾及模拟复杂度，具体数值由实测确定。使用滑动窗口和升降档滞回，避免 FPS 波动导致反复切档。

目标：Apple Silicon Mac 活跃时 60 FPS；普通 Windows 集显至少 30 FPS。必须补充具体测试机型与分辨率后才可报告达标。

无交互时逐步从 60 → 30 → 15 FPS；交互后恢复活跃调度。隐藏、最小化和系统休眠时进一步节流或暂停。记录帧时间与功耗观察，不能仅靠降低粒子数判断低功耗有效。

## 后续数据设计

LifeStorage 将使用带 schemaVersion 的生命快照，包含 Life ID、DNA/种子、年龄、性格、成长、聚合记忆、外观参数与 lastActiveTime。桌面与 Web 通过存储适配器实现，具体介质在持久化阶段决定。

不保存或同步逐帧 GPU 粒子状态。离线恢复使用受限时间推进而非逐帧追赶；处理时间倒退、超长离线与存档损坏。DNA 在创建后稳定保存，性能档位不能改写它。同步冲突、迁移与公开只读权限在对应阶段单独设计。
