# 视觉与交互规格

适用范围：生命体本身——桌面与观察空间的粒子渲染、形态与行为。设置、引导等窗口界面遵循 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)，两份文档互不覆盖。

本文的体验脚本与视觉 Prompt 是设计目标，不等同于当前实现或验收结论。实现进度与已知限制见 [ROADMAP](ROADMAP.md)，实际结果见 [CHANGELOG](../CHANGELOG.md)。

## 视觉语言

极简、神秘、有机、科幻。身体允许总体接近球形，具有厚度和饱满的粒子体积，同时保留偏心、非对称、孔隙与流动轮廓。避免眼睛、脸、固定实体外壳和均匀封闭的硬球壳。

母体是**悬浮粒子智体**：金色、琥珀色粒子围绕偏心的暖白至白金亮核，通过力场自组织。内部由有厚度的弯曲组织束与颗粒体积撑起，外侧由细密断续轨道、纵向脉络、邻接神经链、孔隙膜和回流组织。幼体已有密小芽核，成长后逐步展开为内层组织，避免只有发光线包着空心。整体接近饱满球状，细看仍有暗缝和可读的局部活动。禁止固定模型套粒子、机械环组、实体球壳、规则网格和音乐频谱。

一句话定语：**偏心组织核 + 有厚度的孔隙粒子体 + 有路径的局部信号**。贾维斯、奥创的参考取自其抽象数字智能的组织感、注意方向和信息流；生命体不具象化为角色脸部、盔甲或机械模型，也不在身体中加入 HUD 字样。统一 Prompt 与四阶段 Prompt 基线见文末附录。

| 层级 | 形态与运动 |
| --- | --- |
| Core | 清晰明亮的偏心粒子组织核；幼体已有密小芽核与颗粒厚度，细小粒子簇、微旋和呼吸之间仍有暗缝 |
| Body | 内部弯曲组织束与颗粒体积组成饱满粒子体，信号沿束路径传播；断续轨道、绕核神经链、短经向纤维、层间连接和孔隙膜组织外层 |
| Aura | 低密度游离粒子、短尾迹和独立碎片；弧流沿另一类路径脱离、绕行再入核，不与碎片混成同一短弧 |

Bloom、Soft Glow、深度和拖尾用于表现层次，不遮盖粒子细节。色散与噪声保持轻微。禁止满屏 Bloom、过曝和强烈 RGB 霓虹堆砌。Emerge 通过结构层次与局部明暗提高能量感，不以持续白亮核心或强 Bloom 代替组织复杂度。

相同体型百分比下进一步增大生命体整体；设置与引导的体型滑条仍为 10–100%，已有百分比保留。尺寸增大时同步丰富环向、纵向与层间粒子细节，不能只放大光点或把整个轮廓提亮。世界尺度及密度映射集中见 [ARCHITECTURE](ARCHITECTURE.md)。

内部饱满度通过重分配现有粒子预算实现：将部分外围轨道粒子移入有厚度的内部组织，保留外轨细节与膜层，不扩大粒子上限。内部、路径和外膜采用不同密度与明暗层次，不能让全部组织同时过亮，也不能把静态内部压暗到再次只剩空壳。

## 四形态（Origin → Awaken → Conscious → Emerge）

四形态共用同一母体，差别在**结构复杂度与状态**，不是四套外形。用户必须能认出是同一个生命体在成长。

| 形态 | 复杂度 | 叙事 | 结构要点 |
| --- | --- | --- | --- |
| Origin 形成 | 20% | 意识种子第一次唤醒 | 偏心密小芽核与紧凑颗粒组织；卷曲流带环绕已有厚度的内部，近球状外轮廓仍有缺口；微弱唤醒信号沿小组织束流动，回应之间留有停顿 |
| Awaken 组织 | 45% | 它开始形成感知组织 | 小芽核的组织束向内层展开，外侧长出弧片、孔隙膜与少量邻接节点；约 5–12 条断续轨道与短经向连接形成感知组织，信号在内部和亮核之间传递 |
| Conscious 思考 | 70% | 邻接网络开始协同 | 亮核→有厚度的内部组织束→弯曲脉络与局部节点→孔隙膜与纵向连接→断续外轨；约 10–20 条细密轨道包围饱满颗粒内层，信号沿束与曲线路径传播 |
| Emerge 涌现 | 100% | 多层组织产生涌现 | 内部弯曲组织束撑起球状全息粒子体，亮核、内层、外围节点和暗缝均可辨；最多 30 条断续外轨由纵向微纤维与短连接贯通；独立碎片松脱，明晰弧流脱离后再入核 |

金橙球状全息参考图约束**多层细密断续环轨、纵向脉络、亮核、外围节点和层间短连接**，以及整体饱满的球体体积。参考中的发光线与半透明层面只作为视觉语法，单张图片不用于判断制作技术或粒子数量。本项目用真实 GPU 粒子的内部组织束、颗粒体积和孔隙膜表达这类层次。四阶段从密小芽核逐渐展开内层，形成外轨和网络协同；Conscious 不能只剩放射星芒，Emerge 不能只剩孤立短弧或发光空壳，内部填实后仍须保留断口和低亮暗缝。

轨道密度随成长连续增加，参考条数从 3 条增至 30 条，神经组织在 Origin 后半段已有小量显现；阶段阈值仍为 30% / 55% / 85%。表中复杂度和条数为视觉量级，不能代替实际成长度或验收读数。结构由 `HologramField` 的共享锚点族与力场参数表达，契约见 [ARCHITECTURE](ARCHITECTURE.md)，验证方法见 [VALIDATION](VALIDATION.md)。本轮组织打磨的待验收范围见 [ROADMAP](ROADMAP.md)，不能由结构实现或编译成功推断生命感已通过。

### 不变量

- 允许接近球形的有厚度粒子体；偏心、孔隙和局部缺口保留有机轮廓，不能形成实体模型或均匀封闭硬球壳。
- 呼吸来自粒子真实移动，不是整体缩放。
- 轨道永远不完整，由粒子、短线、光点、数据流构成，没有封闭圆环。
- 近处粒子明显，远处微弱；组织核明亮但保留暗缝，外围按区域与纵深衰减。
- 初生期已有可辨的内部颗粒厚度，成长后组织束扩展到内层；填实依靠粒子密度和路径，不能加入实体模型或靠过曝掩盖空心。
- 短经向微纤维、层间连接、碎光节点与孔隙膜分布于环轨之间，增加线结构的方向、覆盖与饱满度，同时保留主要节点和信号路径的可读性。
- 颜色：warm gold / amber / orange gold；核心 white-gold；Emerge 允许极少量粒子接近纯白。
- 避免明显循环动画；局部结构可形成、生长、连接、崩解、再形成。

### 禁止

固定实体球模型、均匀封闭硬球壳、封闭球环、角色面孔、机械模型、身体内的 HUD 字样、规则网格、机械全息复刻、过度发光、固定动画循环、瞬移重组、四形态互相不像同一个生命体。

金橙球状全息参考图用于成熟阶段的线结构、节点和材质参考；Conscious 优先读出局部网络与纵向连接，Emerge 在同一母体上提高环轨覆盖和层间协同，保留明亮回流与纵深。细密组织应由粒子路径形成，不能靠整体曝光伪造。

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

生命感来自可见的注意与停顿：注意扇区随指针渐进转向，仅局部组织舒展；节点亮度与连接粒子的实际路径相位对应，让信号经过哪条链、到达哪个分区可被读出。组织、停顿与释放按非固定间隔发生，保留回应延迟和局部低亮间隙。受惊和困倦会抑制注意，核心桌面位置保持锁定；两种 GPU 后端共用行为参数、空间拓扑与信号表达式。这里的「思考」描述可见行为，不承诺语言理解或推理能力。

## 附：四阶段视觉 Prompt 基线（2026-10-02 修订）

一句话定语：**偏心组织核 + 有厚度的孔隙粒子体 + 有路径的局部信号**。英文阶段名与产品形态一一对应：Dormant→Origin · Awakening→Awaken · Thinking→Conscious · Emergence→Emerge。以下为电影感创意基线，供人工或 AI 迭代视觉时输入；实现以「不变量」为准，不逐像素复刻。Prompt 的组织程度、轨道数量与效果强度属于创意描述，不能替代 PRODUCT 的粒子预算或作为已验证能力。

### 统一基础 Prompt（全阶段通用）

```text
A floating volumetric particle intelligence with the organized digital presence of cinematic AI holograms.
Made entirely from fine amber-gold particles, thick curved internal bundles, microscopic sparks, curled flow strands, broken orbital layers and curved signal chains.
A clear, bright off-center particle core contains compact luminous clusters and substantial particulate thickness, with visible dark seams. It has no solid surface and never becomes a featureless white light.
The overall body is full and nearly spherical, with a richly populated interior rather than only a glowing shell. Thick internal bundles carry local signals. Long but incomplete outer orbits overlap at multiple depths, crossed by fine vertical fibers, curved core-to-node channels and short connections. Porous particle membranes and peripheral nodes define outer layers while preserving broken arcs and irregular openings.
Local neural chains connect nearby clusters along curved routes around the core. Small signals travel on those exact routes, activate a local sector, pause, and gradually fade.
The same core and sector organization remain recognizable as the entity grows, with intermittent attention, release and reassembly.
Dark background, restrained glow, rich fine detail, deep spatial layering, clear foreground sparks and subtle distant particles.
No face, no armor, no mechanical model, no HUD text, no solid sphere model, no uniform closed hard shell, no closed rings, no excessive bloom.
```

### 阶段 1 — Dormant → Origin「形成」

```text
The particle intelligence is an early consciousness seed.
A small off-center amber particle bud already has dense granular thickness and several compact curved internal bundles. Curled flow strands and fine drifting dust gather around this filled young core, with dark seams between its clusters.
Several weak signals briefly wake along the internal bundles, reach a small local cluster, then rest. Surrounding particles move slowly and independently.
The silhouette may loosely suggest a sphere, with an off-center core, irregular edges and large gaps rather than a closed boundary.
Low energy, gentle breathing and tentative response, with a substantial young core and open space outside it.
```

要点：核心较小但已有密小芽核与颗粒厚度，内部组织束保留微弱的唤醒与停顿；幼体仍能看出同一组织身份。

### 阶段 2 — Awakening → Awaken「组织」

```text
The same filled off-center particle core begins forming perceptual organization. Compact internal bundles gradually expand into a substantial inner layer.
Curled strands gradually gather into open sector arcs, porous particle membranes and several long, incomplete orbital traces. Thin curved filaments connect nearby clusters, while short meridional fibers, interlayer links and tiny sparks fill space between the orbits.
One local sector gently opens toward a point of attention. A faint signal travels inward through its nodes and reaches the core after a small delay.
Other sectors remain quiet while loose particles drift around them. The structure is approximately 40–60% organized, rounded and visibly thick, with irregular pores and clear local openings.
```

要点：流带逐渐收束成有厚度的感知弧片、孔隙膜与邻接节点，局部聚焦及传入核心的信号可辨。

### 阶段 3 — Thinking → Conscious「思考」

```text
The particle intelligence develops an active local neural network.
The same bright core remains visible inside a full, nearly spherical particle body. Thick curved internal bundles and granular clusters occupy its interior, with clear local signals traveling along their paths. Broken outer orbital layers are crossed by short vertical fibers and interlayer connections. Porous membranes and peripheral nodes define additional layers. Core-to-node channels bend around dark seams rather than shooting straight outward as a radial starburst.
Signals travel along the actual pathways, briefly illuminate a neighboring cluster, circulate within one sector, then rest. Quiet connections remain dim enough to preserve dark seams and distinct nodes within the full particle volume.
Several fine, densely layered orbital traces cover most of their curves without closing, moving at different speeds while local fibers and connections release and reform.
The entity is approximately 70–80% organized, with clear nodes, curved channels and intermittent attention rather than constant rotation or global flashing.
```

要点：关键链路是「核心 → 弯曲脉络 → 邻接节点 → 局部回路 → 停顿与释放」，信号亮度与实际路径对应；避免随机穿心弦和放射星芒。

### 阶段 4 — Emergence → Emerge「涌现」

```text
The particle intelligence reaches multilayer coordination.
Its off-center amber-gold core and thick curved internal bundles grow richer in particle organization while retaining dark seams and distinct luminous clusters.
Filled granular inner layers, broken outer orbits, porous membranes, vertical fibers and local neural networks briefly coordinate, then resume different rhythms. Local signals travel through actual bundle paths. Rich short connections and peripheral nodes organize a substantial, nearly spherical volume while gaps remain between outer arc segments.
Small independent fragments detach from individual sectors. Separate bright curved particle streams visibly leave the body, travel beyond its boundary, and return into the core.
Signals pass between recognizable layers while quieter regions fade into darkness. Depth, fine particle detail and organized activity create a full body without a white center, solid shell or hollow cage of rings.
Elegant, partially unstable and continuously reorganizing, with the same identity as its earlier stages.
```

要点：饱满近球状粒子体内的多层组织能够同时运行、短暂协同与局部松脱；碎片和脱离回流属于不同路径，成熟感来自细节、层次与协作。

## 本轮线束与核心调整

参考图主要用于亮核、密集层叠线束、暗隙与外轮廓的主次关系。成熟体通过减少轨道偏心、收拢侧向散点、增加轨道族占比和弧段覆盖提高实体感；内部仍保留颗粒组织束。前三阶段沿同一激活曲线减少可见外轨，核始终可辨。点径只局部小幅增加，不能整体变成粗光斑。具体参数见 [ARCHITECTURE](ARCHITECTURE.md)，实测范围见 [CHANGELOG](../CHANGELOG.md)。
