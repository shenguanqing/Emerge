# 视觉与交互规格

适用范围：生命体本身——桌面与观察空间的粒子渲染、形态与行为。设置、引导等窗口界面遵循 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)，两份文档互不覆盖。

本文的体验脚本与视觉 Prompt 是设计目标，不等同于当前实现或验收结论。实现进度与已知限制见 [ROADMAP](ROADMAP.md)，实际结果见 [CHANGELOG](../CHANGELOG.md)。

## 视觉语言

极简、神秘、有机、科幻。身体可以有偏心、非对称和流动轮廓，但不具象化为已有动物。避免眼睛、脸、固定实体外壳和均匀球状点云。

母体是**悬浮粒子生命核心**：数千至数万金色、琥珀色发光粒子围绕中心暖白至白金能量核，通过力场自组织。禁止固定模型套粒子、机械环组、实体球壳、规则网格和音乐频谱。

一句话定语：**空间全息结构 + 心灵宝石式能量核心 + 星云粒子生命体**——不是一个完整的球，而是一个正在思考、聚合、爆发的 AI 能量体。统一 Prompt 与四阶段 Prompt 基线见文末附录。

| 层级 | 形态与运动 |
| --- | --- |
| Core | 很小但明亮的能量核；高密度粒子微旋、亮度呼吸；不是实体球 |
| Body | 有凝聚性的柔软粒子结构，可形成不完整轨道、内旋涡、神经网与粒子膜 |
| Aura | 低密度游离粒子、短尾迹、碎片、弧形流；逸出后可缓慢回归或绕行再入核 |

Bloom、Soft Glow、深度和拖尾用于表现层次，不遮盖粒子细节。色散与噪声保持轻微。禁止满屏 Bloom、过曝和强烈 RGB 霓虹堆砌。Emerge 允许较强 Bloom，但必须保持轨道与节点结构清晰。

## 四形态（Origin → Awaken → Conscious → Emerge）

四形态共用同一母体，差别在**结构复杂度与状态**，不是四套外形。用户必须能认出是同一个生命体在成长。

| 形态 | 复杂度 | 叙事 | 结构要点 |
| --- | --- | --- | --- |
| Origin 形成 | 20% | 黑暗中第一次出现生命迹象 | 松散不规则粒子云；很小暖白核；少量模糊弧迹；大量游离粒子 |
| Awaken 组织 | 45% | 它开始组织自己的身体 | 不规则半透明球形结构；内旋涡；5–10 条不完整轨道；表面经纬状缺口结构；能量循环 |
| Conscious 思考 | 70% | 它已经开始思考 | 核心旋涡→内轨→神经网→粒子膜→外轨→游离云；高亮节点与细金线；10–20 条不完整大轨道；局部能量脉冲 |
| Emerge 涌现 | 100% | Something has emerged. | 白金高能核；20–30 条破碎大轨道；层级间粒子流；巨大弧形脱离再入核；不稳定碎片；强纵深与非重复变化 |

参考图对应的形态约束：Origin 与 Awaken 以**不对称卷曲飘带**为母体（少量流带由内向外差速缠绕、偏心小亮核、弥散尘）；Conscious 为**放射径向脉络**——白金核 + 约 18 方向辐射丝（末端亮节点簇）+ 神经网信号 + 断续环轨；Emerge 为**约 30 条大倾角断续环轨包络** + 高密度火花链 + 弧流脱离回流，脉络让位给环轨。结构由 `HologramField` 的共享锚点族与力场参数表达；实现细节见 ARCHITECTURE，验证方法见 VALIDATION。

### 不变量

- 轮廓不对称、不完美；任何阶段不得形成规则球。
- 呼吸来自粒子真实移动，不是整体缩放。
- 轨道永远不完整，由粒子、短线、光点、数据流构成，没有封闭圆环。
- 近处粒子明显，远处微弱；中心亮，外围衰减。
- 颜色：warm gold / amber / orange gold；核心 white-gold；Emerge 允许极少量粒子接近纯白。
- 避免明显循环动画；局部结构可形成、生长、连接、崩解、再形成。

### 禁止

完整球体、规则网格、机械全息复刻、过度发光、固定动画循环、瞬移重组、四形态互相不像同一个生命体。

金橙全息参考图只定义 **Emerge 量级**（Conscious 达到该图震撼量级，Emerge 在其上增加弧流、碎片与纵深），不逐像素复刻机械结构。

## 连续生命参数

| 参数 | 主要表现 |
| --- | --- |
| energy / activity | 速度、展开幅度和自主移动 |
| curiosity | 关注鼠标、试探靠近 |
| trust | 靠近时的接受程度与安全距离 |
| stress | 快速收缩、抖动和回避距离 |
| sleepiness | 下沉、聚拢、低速与暗化 |
| mood | 综合色彩、节奏与动作倾向 |

MVP 聚焦 Curious / Scared / Calm；Idle 是自主活动基线。状态不是互斥动画片段，而是连续参数上的行为权重。加入可复现随机种子、缓慢漂移和反应延迟，避免周期性机械重复。

形态与情绪正交：四形态（Origin→Emerge）由成长决定结构复杂度，情绪参数只调制速度、亮度、展开与响应，不切换外形。

呼吸持续存在：核心尺度可从 1.0 → 1.08 → 1.0 作为初始调参参考，外层轻微扩散收缩，亮度缓慢改变。平静慢、兴奋快、惊吓短促；最终幅度通过视觉验证决定。深夜或 sleepiness 高时呼吸转入长周期低幅状态：外围粒子缓慢收缩聚拢，核心亮度下降，只保留少量低亮度漂浮粒子；清晨或互动后按 mood 逐步恢复活跃形态。

## 第一版体验脚本

1. Web / 观察窗口由黑暗开始；桌面模式保留透明背景。
2. 一个微弱粒子出现，随后几十、几百、几千个粒子逐步汇入旋涡，凝聚出呼吸的生命体。
3. 首次靠近，感知后停顿约 200–500ms，核心稍微后退，外围收缩。
4. 继续逼近，生命体避让；自主移动需要边界约束，不能逃出可见区域。
5. 高速划过，身体被冲散，流体式尾迹出现，核心仍可辨。
6. 粒子围绕核心回旋，目标约 2–4 秒重新组成身体。
7. 恢复后保持更大安全距离，stress 缓慢消退，呈现刚刚被吓到的记忆。

以上时间为初始验收目标。力场可以调参，但不能以固定动画或瞬移伪造重组。

## 交互分期

| 交互 | 反馈 | 范围 |
| --- | --- | --- |
| 鼠标靠近 | 感知、迟疑、回避或试探 | MVP |
| 高速划过 | 冲击、驱散、回归 | MVP |
| 慢速绕圈 | 注意和跟随 | 后续细化 |
| 点击 | 局部波纹 | 后续细化 |
| 长按 | 持续吸引场 | 后续细化 |
| 快速连击 | 惊吓与收缩 | 后续细化 |
| 双击 | 进入 Observatory | 桌面观察模式扩展 |

观察空间设计目标是支持旋转、缩放与互动，信息只占少量边缘空间；当前旋转/缩放输入优先用于相机，粒子点击/长按交互的覆盖以实现与验收记录为准。避免大量卡片、数字面板和启动文字提示干扰生命体；必要的错误提示与窗口控制必须仍然可访问。

## 注意与节律

生命感来自可见的注意与停顿，不是轨道密度：注意扇区随指针渐进转向，局部信号沿结构传播；组织、停顿与释放按非固定间隔发生，替代全程等速旋转与均匀闪烁。受惊和困倦会抑制注意，核心桌面位置保持锁定；不以新功能数量替代生命感。两种 GPU 后端共用行为参数与信号表达式。

## 附：四阶段视觉 Prompt 基线（2026-10-01 定稿）

一句话定语：**空间全息结构 + 心灵宝石式能量核心 + 星云粒子生命体**——不是完整的球，而是正在思考、聚合、爆发的 AI 能量体。英文阶段名与产品形态一一对应：Dormant→Origin · Awakening→Awaken · Thinking→Conscious · Emergence→Emerge。以下为电影感创意基线，供人工或 AI 迭代视觉时输入；实现以「不变量」为准，不逐像素复刻。Prompt 中的 millions、轨道数量与效果强度属于创意描述，不能替代 PRODUCT 的粒子预算或作为已实现参数。

### 统一基础 Prompt（全阶段通用）

```text
A floating volumetric AI energy entity inspired by cinematic holographic interfaces and cosmic energy cores.
Made entirely from millions of luminous particles, microscopic sparks, flowing energy filaments, fragmented holographic arcs, orbital traces and translucent data structures.
At the center is a small intense amber-gold energy core, resembling a mysterious crystalline consciousness source, surrounded by incomplete concentric rings and fragmented spherical structures.
The overall silhouette is an irregular, incomplete sphere, never a perfect geometric ball. Large sections are missing, broken or dissolving into free-floating particles.
Particles drift slowly like a nebula in zero gravity, while some streams orbit the core along curved paths. Fine golden filaments occasionally connect distant particle clusters like neural pathways.
The object feels alive and intelligent, constantly reorganizing itself.
Dark background, volumetric glow, cinematic bloom, high dynamic range, holographic transparency, deep spatial layering, extremely fine particle detail.
No solid shell, no complete sphere, no planet appearance, no simple particle ball.
```

### 阶段 1 — Dormant → Origin「形成」

```text
The AI consciousness is dormant.
Only a tiny dim amber core exists at the center. Sparse golden particles float loosely around it like cosmic dust. Most particles move independently and slowly, forming no obvious boundary. A few faint curved trajectories occasionally appear and disappear.
The shape is extremely incomplete and asymmetrical, roughly suggesting a sphere but mostly appearing as a drifting nebula cloud.
Very low energy, slow breathing-like pulsation, large empty spaces between particle clusters.
```

要点：核心很小，像刚「醒」（视觉 shorthand：`· · ✦ ·`）。

### 阶段 2 — Awakening → Awaken「组织」

```text
The central energy core begins awakening and becomes brighter.
Nearby particles are gradually attracted toward it, forming several incomplete orbital rings and curved holographic fragments. Thin golden neural filaments begin connecting particle clusters.
Some particles still drift freely like a nebula while others enter organized orbital motion.
The structure starts resembling a fragmented holographic intelligence sphere, approximately 40–60% formed, strongly asymmetrical and incomplete.
```

要点：开始出现断续环形空间结构，但不能太规整。

### 阶段 3 — Thinking → Conscious「思考」

```text
The AI enters an active reasoning state.
Thousands of particles rapidly reorganize around the glowing core. Multiple fragmented orbital layers rotate at different speeds and directions. Dense streams of golden particles travel between layers like information flowing through a neural network.
Temporary geometric arcs, data trajectories and holographic structures continuously form and dissolve.
The core emits irregular pulses that propagate outward as particle waves.
The entity becomes visually complex and energetic, approximately 70–80% structured, but still never forms a complete sphere.
```

要点：关键链路是「核心脉冲 → 粒子响应 → 环旋转 → 局部结构生成 → 消散 → 再生成」——像「AI 正在思考」，不是一个球在转。

### 阶段 4 — Emergence → Emerge「涌现」

```text
The AI reaches an emergent consciousness state.
The central amber-gold core becomes extremely bright and unstable, radiating concentrated energy through the entire structure.
Complex holographic rings, particle networks and neural filaments briefly synchronize around the core, then partially break apart into enormous flowing particle streams.
Golden particles erupt outward while remaining gravitationally connected to the center, creating an expanding irregular nebula-like consciousness field.
Some regions are extremely dense and luminous while others completely disappear into darkness. Long curved particle trails extend beyond the original boundary.
The entity feels larger than its physical shape, as if intelligence is escaping its container.
Powerful but elegant, chaotic yet organized, strongly asymmetrical, incomplete and constantly evolving.
```

要点：「涌现」与项目名 Emerge 同源——智能正在逸出它的容器；强大而优雅，混沌而有序。
