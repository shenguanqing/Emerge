# 0005：四形态 Origin → Awaken → Conscious → Emerge

日期：2026-09-30。状态：设计已确认，四形态全息骨架实现中。依据用户四形态文本规格与金橙全息参考图。

## 决策

四形态共用「悬浮粒子生命核心」母体，差别只在**结构复杂度与状态**，不做成四套外形。用户能一眼认出是同一个生命体在成长。

| 形态 | 中文 | 叙事 | 结构复杂度 | 现阶段标签 |
| --- | --- | --- | --- | --- |
| Origin | 形成 | 黑暗中第一次出现生命迹象 | 20% | nascent |
| Awaken | 组织 | 它开始组织自己的身体 | 45% | formed |
| Conscious | 思考 | 它已经开始思考 | 70% | ringed |
| Emerge | 涌现 | Something has emerged. | 100% | dual |

参考图（金橙球形全息）**只定义量级**：Conscious 达到该图的视觉震撼量级；Emerge 在其上继续增加自组织动态、弧形流与空间纵深。不逐像素复刻机械结构，不引入球体网格或贴图模型。

## 视觉母体定语与 Prompt 基线（2026-10-01）

一句话定语：**「JARVIS 式空间全息结构 + 心灵宝石式能量核心 + 星云粒子生命体」**。重点不是做一个完整的球，而是让它像一个正在思考、聚合、爆发的 AI 能量体。

核心原则：**同一个生命体的连续状态，不是「四个不同的球」**——粒子数量、核心、轨道体系全程保持连续，只改变组织程度、速度、亮度和混沌程度。散乱星尘 → 核心吸引 → 信息结构 → 意识涌现；这与本决策「共用母体、差别只在结构复杂度与状态」是同一条原则的两种表述。

英文阶段名与产品形态一一对应：Dormant→Origin（形成）· Awakening→Awaken（组织）· Thinking→Conscious（思考）· Emergence→Emerge（涌现）。以下 Prompt 是电影感创意基线，供人工或 AI 迭代视觉时输入使用；实现仍以上方「母体不变量」为准，不逐像素复刻。

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

### 阶段 1 — Dormant / 潜伏 → Origin「形成」

```text
The AI consciousness is dormant.
Only a tiny dim amber core exists at the center. Sparse golden particles float loosely around it like cosmic dust. Most particles move independently and slowly, forming no obvious boundary. A few faint curved trajectories occasionally appear and disappear.
The shape is extremely incomplete and asymmetrical, roughly suggesting a sphere but mostly appearing as a drifting nebula cloud.
Very low energy, slow breathing-like pulsation, large empty spaces between particle clusters.
```

要点：核心很小，像刚「醒」（视觉 shorthand：`· · ✦ ·`）。

### 阶段 2 — Awakening / 唤醒 → Awaken「组织」

```text
The central energy core begins awakening and becomes brighter.
Nearby particles are gradually attracted toward it, forming several incomplete orbital rings and curved holographic fragments. Thin golden neural filaments begin connecting particle clusters.
Some particles still drift freely like a nebula while others enter organized orbital motion.
The structure starts resembling a fragmented holographic intelligence sphere, approximately 40–60% formed, strongly asymmetrical and incomplete.
```

要点：开始出现 JARVIS 式环形 HUD 结构，但不能太规整。

### 阶段 3 — Thinking / 思考 → Conscious「思考」

```text
The AI enters an active reasoning state.
Thousands of particles rapidly reorganize around the glowing core. Multiple fragmented orbital layers rotate at different speeds and directions. Dense streams of golden particles travel between layers like information flowing through a neural network.
Temporary geometric arcs, data trajectories and holographic structures continuously form and dissolve.
The core emits irregular pulses that propagate outward as particle waves.
The entity becomes visually complex and energetic, approximately 70–80% structured, but still never forms a complete sphere.
```

要点：本阶段最接近 JARVIS + 心灵宝石参考；关键链路是「核心脉冲 → 粒子响应 → 环旋转 → 局部结构生成 → 消散 → 再生成」——像「AI 正在思考」，不是一个球在转。

### 阶段 4 — Emergence / 涌现 → Emerge「涌现」

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

## 母体不变量

四形态都必须满足：

- 金色 / 琥珀 / 橙金粒子，中心暖白至白金能量核；Emerge 允许极少量粒子接近纯白。
- 悬浮粒子生命核心；禁止固定模型套粒子、机械环组、实体球壳、音乐频谱、规则网格。
- 轮廓不对称、不完美；任何阶段不得形成规则球。
- 呼吸来自粒子真实移动与聚集，不是整体缩放。
- 轨道永远不完整：由高速粒子、短线、碎片、光点、数据流构成，没有封闭圆环。
- 深黑背景（Web / Observatory）或透明桌面叠层；Bloom 可增强但结构必须清晰，禁止过曝糊成一团。
- 空间纵深：近处粒子明显，远处微弱；中心亮，外围衰减。

## 各形态规格

### Origin「形成」· 20%

小型不规则粒子团，整体近球但轮廓松散、不完整、不对称。数千颗极细小金色、琥珀色发光粒子。中心是**很小但明亮**的暖白能量核。大量粒子围绕核心缓慢漂浮、聚集、散开，像正在寻找稳定结构。只有少量模糊弧形轨迹，无完整圆环、无机械结构。外围大量游离粒子，少量缓慢被吸引。

视觉关键词：minimal · fragile · forming · warm golden particles · tiny energy core · loose particle cloud · subtle orbital motion · asymmetric · volumetric glow。

禁止：完整球体、规则网格、过度发光。

### Awaken「组织」· 45%

主体明显大于 Origin。数万颗金色粒子围绕核心形成不规则半透明球形生命结构。核心亮度增强。内部出现多个不同方向旋转的粒子旋涡。5–10 条由高速粒子自然形成的**不完整**轨道（非实体圆环，由粒子、短线、高速光点构成）。表面开始出现类似经纬的结构，但存在大量缺口。

可见特征：broken orbital rings · particle streams · energy trails · small particle clusters · incomplete spherical membrane · inner vortex。不同区域不同速度与方向。部分粒子从外围进入核心，部分从核心喷出，形成简单能量循环。整体仍明显不对称。

### Conscious「思考」· 70%

大型悬浮粒子核心，轮廓近球但绝不是规则完美球。粒子数量大幅增加。中心为高亮白金能量核。

由核心向外分层：

1. 核心粒子旋涡
2. 内部轨道
3. 神经网络层
4. 粒子膜
5. 外部轨道
6. 游离粒子云

神经网络层：局部高亮节点之间以极细金色光线连接，连接随机出现、断裂、重连；大量高速信号粒子沿连接与曲线运动。表面呈现 digital nervous system / city network / neural pathways 质感。

10–20 条不同倾角的不完整大型轨道，部分穿过主体内部。外围少量漂浮碎片与独立粒子群。局部能量脉冲：某区突然亮起，能量沿网络传播后消失。

### Emerge「涌现」· 100%

巨大、复杂、悬浮在黑暗空间中的金色粒子生命核心。视觉复杂度接近 JARVIS 级全息计算核心，但**不复制机械结构**。完全由 particles · energy nodes · neural connections · particle streams · broken rings · orbital trails · flow fields · floating fragments 构成。

中心极高能量白金核心，周围多个高速旋转粒子旋涡。逐层：

ENERGY CORE → INNER VORTEX → NEURAL NETWORK → PARTICLE MEMBRANE → ORBITAL SYSTEM → OUTER PARTICLE CLOUD

20–30 条不同方向的大型轨道结构，没有一条是完美完整的圆。大量粒子在层级间流动。部分粒子脱离主体，形成巨大弧形粒子流，绕过整个生命体后重新进入核心。外围不稳定碎片。局部结构不断形成、生长、连接、崩解、再形成；**不能出现明显重复动画**。

轮廓保持不规则：左侧可能大型粒子聚集，右上可能破碎轨道，底部可能向外延伸的数据流。必须有非常强的空间纵深。Bloom 强烈但保持结构清晰。

最终感觉：不是机器，不是特效球，不是固定模型；是由无数简单粒子自组织后「涌现」出来的数字生命。

## 与既有决策的关系

- **0003 成长计分与阈值不变**。成长度公式、三条路径、每日递减、DNA 加速全部保留；只替换阶段标签与视觉结构参数。
- **0004 全息轨迹骨架继续作为实现基础**，但「双核 / 旋臂」不再是成熟标志。`dualCore` 退役，改为按形态递增的结构层复杂度。
- 阶段阈值维持 growth 0.3 / 0.55 / 0.85 分档，与现网存档兼容；「结构复杂度 20/45/70/100%」是视觉目标，不是计分公式。

## 实现改造计划（待确认后动代码）

### core（纯 TS，不依赖渲染）

1. `GrowthEngine.GrowthState`：`stage` 改为 `'origin' | 'awaken' | 'conscious' | 'emerge'`。
2. 退役 `dualCore` / 旧 `ring` / 旧 `arms` 语义，替换为连续结构参数（均由 growth 与 DNA 推导，全部 0..1 或可数）：
   - `coreGlow`：核心亮度与半径（Origin 很小 → Emerge 极亮）。
   - `orbitDensity`：轨道数量级（映射 0 → 5–10 → 10–20 → 20–30）。
   - `orbitBroken`：轨道不完整程度（始终偏高，禁止封口成圆）。
   - `vortex`：内旋涡强度与数量。
   - `neural`：神经网节点密度、连线活跃度、信号粒子占比（Origin≈0，Awaken 起出现，Conscious 明显，Emerge 饱和）。
   - `membrane`：粒子膜完整度（允许缺口）。
   - `fragment`：外围碎片与独立粒子群数量。
   - `streamArc`：Emerge 弧形脱离-回流概率。
   - `pulse`：局部能量脉冲频率。
   - `depthFade`：纵深衰减强度。
3. 保留 `particleMul`，密度需支撑 Conscious/Emerge 的粒子量感；质量降档不得改变 stage 身份。

### render

1. `HologramField` 扩展为多族锚点：core cloud / orbital lanes（条数随 `orbitDensity`）/ neural nodes+edges / membrane shell / outer fragments / arc streams。
2. 仍用共享数学表达式生成 GLSL/WGSL，两后端参数语义一致。
3. 粒子仍通过弹簧力、阻尼、交互力逼近目标，不把位置直接赋值；重组、脉冲、弧流全部走力场与相位，禁止瞬移与循环动画。
4. 颜色：暖金 → 琥珀 → 橙金按半径衰减，核心白金；去白程度参考 0004。

### UI 文案

设置阶段节点、托盘、Observatory、调试诊断同步改为 Origin / Awaken / Conscious / Emerge（形成 / 组织 / 思考 / 涌现）。双核相关文案删除。

### 验收

- `?growth=0.2 / 0.45 / 0.7 / 1.0` 四档截图：母体可辨、复杂度递增、无一档是完美球或机械环。
- WebGPU 与 WebGL2 同结构族对照。
- Conscious 观感达到参考图震撼量级；Emerge 再增加弧流、碎片、纵深与非重复动态。
- 桌面小尺寸（透明窗）下核心与轮廓仍可读。
- 交互（靠近、冲散、音乐）在四形态下均可用，不因形态换皮失效。

## 明确不做

- 不把四形态做成四套模型或四套换肤。
- 不复制参考图的机械结构、实体面板、规则经纬网。
- 不在本决策中扩展成长计分、账号、分享。
- 不宣称电影级逐像素复刻。

## 2026-10-01：融合不规则生命运动

保留已有种子族与四形态曲线，在结构锚点之外加入共享 looseAnchor 流动场，按成长与粒子族连续混合。初生偏松散，成熟主体保留清晰轨道但局部会减弱凝聚；区域释放由两个错相周期共同控制，不使用逐帧白噪声抖动。位置始终通过力场积分，不直接跳到新坐标。

轨道保留约 20%–40% 的大缺口；神经节点分散为小粒子簇，连接端点在每个周期末平滑迁移到下一节点，信号相位沿连接流动。后期局部亮度脉冲加强，避免整体同步闪成白球。两端共用形态和信号表达式。

运行检查同时发现 WGSL 不支持的三元表达式及合并着色器重复 hash1 声明，已修正；WebGPU 初始化加入 validation error scope，失败时返回给上层，使用新 canvas 尝试 WebGL2，避免绑定过 WebGPU 的 canvas 无法创建 WebGL context。

## 2026-10-01：参考图四形态定稿——飘带母体与径向脉络

用户反馈初版实现「太规整、尤其前两阶段像球」，并给出三张参考图与最早实拍 `docs/reports/mature-form-retest/sheet.jpg`（丝缕飘带形态）。据此定稿：

### 各阶段视觉基准

- **Origin 形成（20%）**：sheet.jpg 与参考图 1 左侧个体——少量卷曲飘带 + 偏心小亮核 + 若隐若现弯曲碎弧 + 弥散尘；无膜、无脉络、无神经。
- **Awaken 组织（45%）**：飘带仍为主体的同时开始组织——内旋涡增强、约 10 条断续轨道成形、膜面初现缺口、脉络萌发。
- **Conscious 思考（70%）**：参考图 2（放射脉络球）——白金核 + 18 方向径向脉络（末端亮节点簇）+ 神经网信号 + 断续环轨 + 碎片。
- **Emerge 涌现（100%）**：参考图 3（JARVIS 多环球）——约 30 条大倾角断续环轨包络 + 高密度火花链 + 极亮白金核 + 弧流脱离回流 + 外围碎屑；脉络减半让位给环轨。

### 实现改动

1. `looseAnchor` 重写为**飘带生成器**：4 条由内向外差速缠绕的卷曲流带（每条独立倾角/缠绕量/速度，带内散布随半径展开，纵向波浪起伏），亮核自然出现在带的内端；替代原各向同性球云——各向同性的球云无论怎么扭转都是「球」，丝缕感必须来自锚点分布本身。
2. 新增**径向脉络族**（spoke，占种子区间 [0.66, 0.74)）：从核心伸向外壳的辐射丝（18 方向、微弯、末端趋亮），曲线 `smoothstep(0.20,0.50,g)·(1−0.55·smoothstep(0.78,1,g))`，与 `GrowthEngine.FormStructure.spoke` 同式；脉络未激活时回落为自由尘。
3. `hologramAnchor` 末端加入**飘带化形变**（强度 `1−smoothstep(0.15,0.75,g)`）：对结构锚点做差速旋绕 + 压扁拉长 + 大尺度波瓣，低成长把轨道等结构也卷进飘带流，成熟期淡出。
4. 种子区间重排：轨道 [0.34,0.66)、脉络 [0.66,0.74)、膜 [0.74,0.84)；碎片/弧流不变。成熟期轨道半径抖动与带宽收窄，粒子串成更细的火花链。
5. 渲染端（两后端一致）：脉络末端按同哈希 `along` 提亮、尺寸微增。

### 验证

- `?growth=0.2 / 0.45 / 0.7 / 1.0`（bodyScale=1，1024×768）：WebGPU 全四档目视对照参考图——Origin/Awaken 呈不对称卷曲飘带（与 sheet.jpg 同量级），Conscious 呈放射脉络+亮节点（参考图 2 量级），Emerge 呈环轨包络+弧流（参考图 3 量级）。
- WebGL2 对照 Origin 与 Emerge 两档：形态与 WebGPU 一致；`__emergeErrors` 为空；60/59 FPS（45k–88k 粒子）。
- 核心测试 24/24（新增 spoke 曲线断言：Origin=0、Conscious 最密、Emerge 让位）。
- 待打磨：Conscious/Emerge 相对参考图的细节密度仍有差距（参考图为电影级粒子量），桌面小窗观感与不同屏幕尺寸未验。
