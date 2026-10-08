# 视觉与交互规格

适用范围：生命体本身——桌面与观察空间的粒子渲染、形态与行为。设置、引导等窗口界面遵循 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)，两份文档互不覆盖。

本文的体验脚本与视觉 Prompt 是设计目标，不等同于当前实现或验收结论。实现进度与已知限制见 [ROADMAP](ROADMAP.md)，实际结果见 [CHANGELOG](../CHANGELOG.md)。

## 视觉语言

完全体以用户 2026-10-04 提供的参考截图（科幻电影能量体正面镜头）为首要目标：**琥珀色三维电路球壳、前后错层、外伸矩形支路、小型亮核环腔及穿过核心的横向传输束**。取消早期“唯一横向巨环”的造型硬约束；数据弧服从球体层次，不应成为共面天体仪。参考是视觉目标，不表示当前已达到电影复刻程度。

### 原制作参考与取舍

- [Animal Logic 制作介绍](https://animallogic.com/portfolio/projects/avengersageofultron/)：确认参考形态的橙色、棱角电路方向，与同片中蓝色有机形态区分。
- [Matt Ebb 多镜头作品页](https://mattebb.cargo.site/Avengers-Age-of-Ultron)：实际查看实验室远景、斜向近景、正面及受袭画面。正常镜头用于球壳和数据环比例；蓝色袭击线不进入常态形态。作者参与外围音频响应数据环制作，不能将作者页面中的全部形态照搬到本项目。
- [SideFX 原制作访谈](https://www.sidefx.com/community/the-avengers-age-of-ultron/)：参考程序化三维组织、内部能量传递与运动系统的设计思路；不据此推断本项目的 GPU 粒子预算或性能。

当前结构由三层球面电路、24 族径向支路、横向传输束、中央五层小环腔和一组偏心内弧和两组贴合球面的断续数据弧组成。球面片区包含长短线、直角转接及错位末端，外围矩形端口沿同一球面方向延伸，以连续细丝和局部亮末端表达，避免被渲染成松散暗尘。核心由偏心、错倾角且有轴向起伏的卷曲弧段形成，保留暗心、金白热点和微小漂移；外层保持琥珀色与暗隙。所有可见结构仍由真实粒子组成，通过力场积分运动，不增加实体球、管道模型或贴图。

球面与径向支路连续自转，数据弧独立流动，横向通道保持可读的主方向；近远亮度与路径能量包提供层次。正常运动以路径切线画细丝，高速驱散才转向速度尾迹，避免平静时满球毛刺。曝光与光晕保持局部，不添加后处理 Bloom。

### 细节密度与光学层次

局部电路片使用球面切向坐标和浅弯深度：平行排线、两次台阶与矩形节点共享一块片区，保留较平直的边缘；片区之间仍按三层球面方向错开，数据弧与径向通道保持原有曲线。片区不是实体面片，所有可见部分仍是通过力场聚合的粒子。

同预算内将部分球层颗粒用于短跨接和矩形微端口：跨接每片六个位置，端口每片三个位置、两条纤维带，集中采样形成连续轮廓。片区主路径采用两次台阶转接，端口横档连接并列导体；主干、支线与矩形小节点使用不同笔画长宽比。主干比支线更亮，亮度按连续路径分区变化，避免逐点随机闪亮造成砂砾感；弧带和外缘数据流减少随机位置厚度。

光学采用随相机深度连续变化的透射近似：后层压暗并略扩散，前层保持锐利；这不是实体遮挡或物理体积渲染。线芯与圆形高斯光晕独立计算，透明边缘归零，核心保留低强度柔光底和少量强热点，外围光晕只分配给端口/能量包。保留空隙、核心暗心，不用全屏 Bloom 填满空白。

## 四形态（Origin → Awaken → Conscious → Emerge）

四阶段沿同一拓扑连续组织，阈值保持 30% / 55% / 85%，不改变生命身份与成长记录。

| 形态 | 参考成长度 | 结构要点 |
| --- | --- | --- |
| Origin 形成 | 20% | 小型亮核、卷流与未组织颗粒，少量支路萌发 |
| Awaken 组织 | 45% | 横向传输方向出现，径向束和局部球面电路从颗粒云中聚拢 |
| Conscious 思考 | 70% | 多层电路球壳可辨，数据弧逐步展开，内外路径开始互相连接 |
| Emerge 涌现 | 100% | 完整的三维球面电路、错层数据弧、外伸矩形端口、中央亮核与横向传输束；正面和侧面均有厚度 |

`FORM_ORBIT_LANES = 30` 保留容量与成长语义；其中 6 条为偏心内弧、12 条为球面数据弧细丝，其余 12 条补充球面电路。观察空间的“环丝”是组织容量读数，不等于宏观圆环数量。预算上限仍为 100,000，细节密度、透明桌面和长期生命感验收见 [ROADMAP](ROADMAP.md)，结果见 [CHANGELOG](../CHANGELOG.md)。

### 不变量与边界

- 球壳和径向束有真实前后空间，旋转后不能塌成圆盘。
- 保留不规则断口、分区密度与核心暗心，避免均匀经纬网和整团过曝。
- 呼吸、驱散和重组经过力场，不直接赋值目标位置。
- 质量变化不改变年龄、成长、DNA 或生命身份。
- 不添加人物面孔、盔甲、实体机械模型或 HUD 字样。

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

八态权重（2026-10-08 起）：Calm / Curious / Scared 之外新增 Explore / Excited / Sleepy / Playful / Lonely，全部为 lagged 连续权重（可并存），驱动与表达如下。新增态不引入渲染 uniform，只经核心目标、收缩、排斥与跟随速度表达；情绪标签优先级为 scared > excited > playful > curious > sleepy > lonely > explore > alert（收缩）> calm，新态阈值 0.55。

| 状态 | 驱动 | 身体表达 |
| --- | --- | --- |
| Explore | 高 activity 且无指针、无受惊、清醒 | 漫游幅度扩大（约 2.2 倍），跟随稍快 |
| Excited | 高 energy 或新刺激（脉冲/点击/长按），无受惊、较清醒 | 趋近增益提高、跟随加快、排斥略降 |
| Sleepy | 现实昼夜 sleepiness（LifeEngine 值） | 漫游收敛回家、趋近被抑制、跟随变迟、轻微内收 |
| Playful | 高 trust + 温和慢速互动，无受惊、清醒 | 趋近增益提高、跟随加快 |
| Lonely | 无指针累计超过 3 分钟（满权重约 15 分钟）起算，无受惊、清醒；指针出现即清零 | 漫游收拢、跟随变迟、轻微内收、戒备略升 |

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

常驻粒子团支持从主体区域按下并拖动旋转，累计移动 5 CSS px 后进入旋转；与观察空间共用灵敏度与俯仰限制。旋转保留屏幕摆位与大小，松手保留本次会话角度；关闭观察空间恢复常驻角度。拖动期间抑制鼠标惊扰、长按吸引与点击涟漪；静止长按、轻点和双击入口保留。验证边界见 [ROADMAP](ROADMAP.md)。

观察空间设计目标是支持旋转、缩放与互动，信息只占少量边缘空间；当前旋转/缩放输入优先用于相机，粒子点击/长按交互的覆盖以实现与验收记录为准。避免大量卡片、数字面板和启动文字提示干扰生命体；必要的错误提示与窗口控制必须仍然可访问。

## 注意与节律

生命感来自可见的注意与停顿：注意扇区随指针渐进转向，仅局部组织舒展；电路片区和径向束的亮包与真实路径相位对应，让信号沿哪一束向哪个分区传递可被读出。组织、停顿与释放按非固定间隔发生，保留回应延迟和局部低亮间隙。受惊和困倦会抑制注意，核心桌面位置保持锁定；两种 GPU 后端共用行为参数、空间拓扑与信号表达式。这里的「思考」描述可见行为，不承诺语言理解或推理能力。

## 附：四阶段视觉 Prompt 基线（2026-10-03 修订）

以下为 2026-10-03 的创意基线存档，仅记录当时方向；其中唯一主环的造型约束已被当前视觉语言（见上文「视觉语言」）取代，不作为实现或验收约束。具体实现与验收分别链接 ARCHITECTURE / ROADMAP / CHANGELOG，不以 Prompt 描述代替已验证能力。

### 统一基线

```text
A cinematic volumetric particle intelligence, made entirely from warm gold and amber particles.
A central particulate nucleus with concentrated platinum hotspots, three staggered layers of angular circuit patches, and uneven curved radial bundles with occasional forks in three dimensions.
One tilted main ring hugs and extends just beyond the sphere. Three unequal arcs have large real gaps, staggered ragged ends and parallel data strands; surface patches contain short circuit elbows, thickness and negative space instead of a continuous latitude-longitude mesh.
The sphere and radial bundles rotate together around a tilted axis with small bounded local offsets; particles and bright packets circulate along the broken main ring at a different speed. Local signals, warm core vortices, short energetic trails and concentrated glowing hotspots remain readable.
Sharp foreground grain, dimmer distant structures, substantial depth and negative space between bundles.
No solid sphere model, face, armor, HUD text, multiple competing horizontal rings, planar radial flower or uniformly overexposed body.
```

| 阶段 | 基线要点 |
| --- | --- |
| Origin 形成 | 中央芽核、颗粒厚度与卷流，径向方向初显，外层尚未完全组织 |
| Awaken 组织 | 径向纤维伸展，局部球层和节点形成，传输束与少量数据弧开始建立 |
| Conscious 思考 | 球层片区与径向束共同撑起体积，断续数据弧成形，三维自转和沿路径传播的能量开始清楚 |
| Emerge 涌现 | 中央核的白金热点、不均匀径向束、厚的破碎球壳、错层的断续数据弧与横向传输束、分层自转与局部光晕和短尾迹 |

成长的显现顺序保持核心 → 局部通道和电路片 → 球面组织 → 外伸端口。未激活数据弧与未成形端口压低曝光，避免中间阶段的漂散颗粒盖住已有结构；这些是连续显现参数，不改变四阶段阈值或生命身份。
