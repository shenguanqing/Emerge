# 产品定义

## 愿景

Emerge 是生活在用户设备里的抽象数字生命。它没有固定物种、面孔或实体模型。用户先被视觉吸引，再通过交互感受到行为与情绪，长期使用后形成独特的生命形态。

视觉参考星云、深海生命、磁流体、极光与微生物，最终形成原创语言。不可退化为普通粒子球、屏保、Shader 展示或音乐频谱。

## 平台与体验

| 平台 / 空间 | 目标 |
| --- | --- |
| macOS / Windows | 透明无边框桌面生命体，以及窗口观察模式 |
| Web | 完整核心观察与互动；浏览器内重新凝聚 |
| Observatory | 黑暗沉浸空间，生命体居中，少量科研观察式界面 |
| iOS / Android | 后续扩展，首阶段不实现 |

完整桌面体验包括置顶、鼠标穿透、位置锁定、自由移动和双模式切换。MVP 先交付透明桌面窗口与可用的交互/退出入口；其余桌面控制逐项验证和推进，不视为已完成。

## 首轮 MVP

1. 单生命体，20k–100k GPU 粒子，Core / Body / Aura 三层可辨。
2. 呼吸、自主 Idle、Curl Noise / Flow Field；运动有整体凝聚性和局部变化。
3. 鼠标接近可感知，高速划过可驱散，粒子以力场自然回归。
4. Curious / Scared / Calm 三种状态，以连续参数和反应延迟表现。
5. Web Demo 与 macOS / Windows 透明桌面窗口。
6. FPS 自动质量调整及常驻低功耗策略。

起始约 20k 粒子。较高质量逐步提升至 100k；远期 50k–500k 不作为 MVP 门槛。性能预算和成长结构分别控制，避免降画质被误认为生命退化。

## 后续能力

- 行为扩展：Explore、Excited、Sleep、Playful、Lonely 等。
- DNA：创建时生成并永久保存 movementStyle、symmetry、particleDensity、coreCount、tailProbability、noiseFrequency、noiseStrength、curiosityBase、fearBase、energyBase、growthBias、orbitBias、flowBias。
- 成长：由 DNA 与长期互动塑造多核心、环、尾迹、触手、卫星粒子、不对称结构等抽象特征；不绑定固定物种等级。
- 本地记忆：陪伴时长、互动方式与次数、活跃时段、夜间使用、音乐互动、离开和连续陪伴天数；不使用 AI API。映射示例：频繁快速晃动鼠标推高 fear，缓慢平稳互动推高 trust，长期夜间使用发展出更明显的夜间发光特征，长时间离开降低 trust 并加深初始回避。
- 时间与离线：现实昼夜影响活动、亮度和睡眠；关闭应用不会死亡；通过 lastActiveTime 在回归时呈现唤醒与凝聚。
- 音乐：Bass / Mid / Treble / Energy / Beat 影响行为、核心和外层粒子，不呈现频谱条。
- 完整 Observatory：旋转、缩放、成长观察，少量 Age / Energy / Mood / Trust / DNA / Evolution 信息。
- 跨设备与账号：仅同步 DNA、年龄、性格、成长、记忆和外观参数，不同步实时粒子位置。
- 分享：Life ID 与公开只读生命页面，访客不能改变拥有者生命状态。

## 成功标准

首轮目标是让用户在没有成长、账号、商城或任务机制时，仍愿意互动 5 分钟。需要观察到“它发现了我”“它被吓到了”“它正在恢复”的反馈。达不到时暂停功能扩张，先优化运动、粒子、Shader 与交互。
