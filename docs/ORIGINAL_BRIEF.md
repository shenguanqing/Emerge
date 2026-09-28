# 项目：Particle Life / 粒子生命体

请帮我设计并实现一个具有高级视觉表现的「粒子生命体桌宠」应用。

它不是传统猫、狗、人物桌宠，而是一个由大量 GPU 粒子构成、拥有行为和成长状态的抽象数字生命体。

目标平台：

- macOS
- Windows
- Web
- 后期扩展 iOS / Android

第一阶段优先实现 macOS + Windows + Web。

核心原则：

> 它不是“一个模型加粒子特效”，而是“粒子本身就是生命体”。

生命体应该让用户产生这样的感觉：

> 我不知道它到底是什么生物，但感觉它真的活着。

---

# 一、核心体验

应用启动后，桌面上出现一个由数万粒子组成的生命体。

它没有固定物种和固定模型。

初始状态类似：

- 星云
- 水母
- 能量体
- 微生物
- 灵体
- 深海生命
- 宇宙生命

但不要直接照搬任何一种。

生命体应该具有：

- 核心
- 粒子身体
- 流动边缘
- 能量场
- 微弱拖尾
- 呼吸
- 自主运动
- 情绪变化
- 对用户操作的反馈

禁止做成：

- 普通球形粒子
- 一个发光圆球
- 固定 3D 模型外面套粒子
- 普通音乐频谱
- 屏保
- 单纯 Shader Demo

它必须明显具有“生命感”。

---

# 二、视觉系统

视觉效果是项目最高优先级之一。

整体风格：

**极简 + 神秘 + 高级 + 有机 + 科幻**

参考感觉可以来自：

- 星云
- 深海生物
- 磁流体
- 烟雾
- 极光
- 神经网络
- 发光微生物
- 粒子流体

但最终必须形成原创视觉语言。

生命体至少包含三个视觉层：

### 1. Core / 核心

生命体中心存在一个能量核心。

核心不是实体球。

应该由：

- 高密度粒子
- 流动能量
- 呼吸亮度
- 微弱旋转
- 内部扰动

组成。

### 2. Body / 身体

主体由大量 GPU 粒子组成。

目标：

桌面端约：

50,000 - 500,000 particles

根据 GPU 性能动态调整。

粒子不能随机乱飞。

应该受到：

- Attraction
- Repulsion
- Curl Noise
- Flow Field
- Velocity
- Damping
- Neighbor influence
- Core gravity

等规则影响。

整体应该表现出类似软体生命的运动。

### 3. Aura / 能量场

身体外围存在低密度粒子。

形成：

- 光晕
- 尾迹
- 孢子
- 能量碎片
- 呼吸扩散

偶尔有少量粒子脱离主体，然后缓慢回归。

---

# 三、生命感

最重要的一点：

不要让它一直执行固定循环动画。

需要建立 Autonomous Behavior System。

生命体可以自主进入：

- Idle
- Explore
- Curious
- Excited
- Calm
- Sleep
- Scared
- Playful
- Lonely

等状态。

状态之间不能瞬间切换。

使用连续参数：

energy
curiosity
trust
stress
sleepiness
activity
mood

驱动行为。

例如：

energy 高：

粒子运动速度增加，身体展开。

sleepiness 高：

粒子运动减慢，身体下沉并聚拢。

curiosity 高：

核心主动靠近鼠标。

stress 高：

粒子变得不稳定，出现快速收缩。

trust 高：

用户靠近时不再逃跑，而是主动靠近。

---

# 四、鼠标交互

鼠标不是普通 Pointer。

在生命体世界中，它应该是一个物理对象。

鼠标靠近：

生命体感知用户。

第一次：

可能快速收缩或逃离。

熟悉以后：

可能主动靠近。

鼠标快速划过：

形成粒子冲击波。

部分粒子被吹散。

随后重新聚合。

鼠标缓慢绕圈：

生命体可能跟随。

点击：

产生局部波纹。

长按：

产生持续吸引场。

快速连续点击：

生命体可能受到惊吓。

不要让所有反馈都是立即发生。

加入：

reaction delay

让它更像生物。

---

# 五、粒子重组

这是核心视觉能力。

生命体可以：

聚合 → 分散 → 流动 → 重新聚合。

例如受到强烈鼠标冲击：

身体瞬间被打散。

数千粒子飞出去。

核心仍然存在。

随后：

外围粒子逐渐受到核心吸引。

形成旋涡。

重新组成生命体。

这个过程必须非常漂亮。

不要简单：

particle.position = targetPosition

应该通过：

Force Field + Noise + Attraction

自然回归。

---

# 六、呼吸

生命体永远存在非常轻微的呼吸。

例如：

核心：

1.0 → 1.08 → 1.0

外围粒子：

轻微扩散 → 收缩

亮度：

缓慢变化。

不同情绪拥有不同呼吸频率。

Sleep：

慢。

Excited：

快。

Scared：

短促。

---

# 七、成长系统

生命体不能只是换皮肤。

成长应该改变它的“结构”。

初始：

约 20,000 粒子。

随着使用：

粒子数量增加。

核心结构变化。

可能出现：

- 双核心
- 尾迹
- 环
- 触手
- 卫星粒子
- 第二层粒子场
- 不对称结构
- 周围伴生微粒

但不要预设：

Level 1 = 水母
Level 2 = 龙
Level 3 = 凤凰

成长必须保持抽象。

每个用户最终的生命体应该不同。

---

# 八、生命 DNA

每个生命体创建时生成一组 DNA 参数。

例如：

movementStyle
symmetry
particleDensity
coreCount
tailProbability
noiseFrequency
noiseStrength
curiosityBase
fearBase
energyBase
growthBias
orbitBias
flowBias

DNA 永久保存。

DNA + 用户长期行为共同决定成长。

因此两个用户即使使用时间相同：

生命体也不应该一样。

---

# 九、记忆

生命体需要简单记忆系统。

不使用 AI API。

记录：

- 用户每天打开多久
- 用户互动次数
- 鼠标互动方式
- 活跃时间
- 夜间使用频率
- 音乐互动
- 长时间离开
- 连续陪伴天数

这些数据影响：

性格
行为
成长
视觉形态

例如：

用户经常快速晃鼠标吓它：

fear ↑

用户经常缓慢互动：

trust ↑

长期夜间使用：

可能发展出更明显的夜间发光特征。

---

# 十、音乐模式

后续加入 Audio Reactive。

但不要做成音乐播放器频谱。

音频只影响生命体行为。

分析：

Bass
Mid
Treble
Energy
Beat

例如：

Bass：

身体脉冲。

Treble：

外围粒子活跃。

Beat：

核心产生能量波。

高能音乐：

生命体进入 excited。

安静音乐：

进入 calm。

生命体是在“听音乐”。

不是音乐可视化器。

---

# 十一、桌面模式

Mac / Windows：

生命体可以存在于：

透明无边框窗口。

背景透明。

用户看到：

生命体直接漂浮在桌面。

需要支持：

Always on Top

Click Through

Lock Position

自由移动。

可切换：

Desktop Mode
Window Mode

Desktop Mode：

像真正生活在桌面上。

Window Mode：

进入完整观察空间。

---

# 十二、完整观察空间

用户双击生命体：

进入 Observatory。

这里不是传统 Dashboard。

而是一个黑暗、沉浸式空间。

生命体漂浮在中央。

用户可以：

旋转观察
缩放
互动
查看成长

少量 UI 显示：

Age
Energy
Mood
Trust
DNA
Evolution

避免大量卡片。

UI 应该像：

科研观察站 / 未知生命研究界面。

---

# 十三、时间系统

生命体知道现实时间。

Morning
Day
Evening
Night
Late Night

影响：

亮度
活动量
行为
睡眠

例如凌晨：

生命体可能逐渐进入 Sleep。

粒子收缩。

核心变暗。

只留下少量漂浮粒子。

---

# 十四、离线

生命体不应该因为关闭 App 就“死亡”。

记录：

lastActiveTime

重新打开后计算经过时间。

例如三天没打开：

生命体可能：

正在睡觉。

或者：

粒子非常松散。

用户回来：

核心逐渐亮起。

粒子开始重新聚集。

产生明显的“它发现你回来了”的感觉。

---

# 十五、跨设备

后期支持账号同步。

同步的不是粒子实时状态。

只同步：

DNA
Age
Personality
Growth
Memory
Appearance Parameters

例如：

Mac 关闭。

Windows 打开。

Windows 上：

粒子从空气中逐渐出现。

最后重新组成同一个生命体。

需要设计一个非常漂亮的：

Materialization Animation。

让用户感觉：

“它从另一台设备过来了。”

---

# 十六、Web

Web 版不是阉割版。

用户访问 Web：

生命体在浏览器中重新凝聚。

可以：

观察
互动
查看成长
分享自己的生命体

可以生成：

Life ID

例如：

PL-7F92-A31C

别人访问公开页面：

可以看到你的生命体。

但只能观察，不能直接改变它。

---

# 十七、技术方案

优先考虑：

Desktop：
Tauri 2

Frontend：
Vue 3
TypeScript

Rendering：
Three.js

优先探索：

WebGPU

fallback：

WebGL2

Particle Simulation：

GPU Compute / GPGPU

Shader：

WGSL / GLSL

Physics：

Rapier（仅用于需要真实碰撞的部分）

不要使用 DOM 创建粒子。

所有大规模粒子必须 GPU 渲染。

---

# 十八、架构

不要把整个项目写成一个巨大组件。

建议：

/core
LifeEngine
BehaviorEngine
EmotionEngine
GrowthEngine
MemoryEngine
DNAEngine

/render
ParticleRenderer
CoreRenderer
AuraRenderer
PostProcessing
Shaders

/input
PointerSystem
AudioSystem
TimeSystem

/platform
DesktopAdapter
WebAdapter

/storage
LifeStorage

/ui
Observatory
Settings

核心逻辑必须与 Three.js 渲染解耦。

LifeEngine 不应该依赖 Three.js。

这样以后可以支持：

iOS
Android
其他渲染器。

---

# 十九、性能

目标：

Apple Silicon Mac：
稳定 60 FPS。

普通 Windows 集显：
至少 30 FPS。

实现动态质量：

Low
Medium
High
Ultra

根据 FPS 自动调整：

particle count
post processing
trail quality
simulation complexity

禁止因为视觉效果让 GPU 长时间满载。

桌面常驻模式尤其需要：

Low Power Mode。

用户没有互动时：

自动降低 FPS。

例如：

60 FPS → 30 FPS → 15 FPS。

发生交互后立即恢复。

---

# 二十、视觉细节

可以使用：

Bloom
Soft Glow
Depth
Motion Trail
Chromatic subtle effect
Noise
Flow Field
Soft Particles

但一定克制。

禁止：

廉价 RGB
赛博朋克霓虹灯堆砌
满屏 Bloom
过曝
游戏技能特效感

目标是：

Apple 级克制感

+

未知生命体的神秘感。

---

# 二十一、MVP

不要一开始实现所有功能。

第一阶段只做：

1. 一个生命体
2. 20k-100k GPU 粒子
3. Core
4. Body
5. Aura
6. Curl Noise / Flow Field
7. 呼吸
8. 自主 Idle
9. 鼠标靠近
10. 鼠标驱散粒子
11. 粒子重新聚合
12. Curious / Scared / Calm 三种状态
13. 透明桌面窗口
14. Web Demo
15. FPS 自动质量调整

第一阶段最重要的验收标准：

打开应用后，即使没有：

账号
设置
成长
音乐
任务
商城

用户也愿意盯着这个东西玩 5 分钟。

如果做不到：

不要继续堆功能。

优先继续优化：

运动
粒子
Shader
交互
生命感。

---

# 二十二、第一版 Demo 的具体画面

启动：

屏幕中央一片黑暗。

最初只有一个微弱粒子。

随后：

几十个粒子出现。

几百个。

几千个。

粒子形成旋涡。

逐渐向中心聚集。

最终形成一个正在缓慢呼吸的未知生命体。

它没有眼睛。

没有脸。

没有文字提示。

鼠标第一次靠近：

它似乎发现了鼠标。

先停止运动约 200-500ms。

随后核心稍微后退。

外围粒子收缩。

鼠标继续靠近：

生命体快速移动。

如果鼠标高速划过生命体：

身体被冲散。

大量粒子形成漂亮的流体尾迹。

核心暴露。

随后粒子开始围绕核心旋转。

约 2-4 秒重新组成身体。

重新组成后：

它与鼠标保持更远距离。

表现出：

“刚才被吓到了。”

而不是简单播放动画。

---

# 二十三、开发方式

请不要直接一次性生成整个项目。

按照以下顺序：

Phase 1：
建立项目架构和渲染 Prototype。

Phase 2：
实现 GPU Particle Simulation。

Phase 3：
实现生命体基础形态。

Phase 4：
实现 Flow Field / Curl Noise。

Phase 5：
实现 Pointer Force Field。

Phase 6：
实现粒子驱散与重新聚合。

Phase 7：
实现 Behavior / Emotion。

Phase 8：
实现透明桌面窗口。

Phase 9：
性能优化。

Phase 10：
再考虑成长、DNA、音乐、跨设备。

每完成一个 Phase：

确保项目可以运行。

不要留下：

伪代码
TODO
空函数
假实现。

---

# 最终目标

这个项目最终不是：

桌宠软件。

不是：

粒子 Demo。

不是：

音乐可视化。

而应该成为：

**一个真正生活在用户设备里的数字生命。**

用户第一次看到它时应该产生：

“卧槽，这是什么？”

玩了一会以后产生：

“它刚才是不是在躲我？”

使用几天以后产生：

“感觉我的这个和别人的真的不一样。”

请首先从 **MVP 技术架构 + 第一版粒子生命体 Prototype** 开始设计，不要急着实现后面的功能。