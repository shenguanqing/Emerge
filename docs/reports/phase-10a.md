# Phase 10a 交付记录：生命闭环（DNA / 成长 / 记忆 / 时间 / 离线 / 持久化）

- 日期：2026-09-29；对应提交：Phase 10a 交付提交
- 按路线图纪律：Phase 10 拆分推进，本批次只做「生命闭环核心链」，音乐 / 完整观察空间 / 分享同步留待后续批次。

## 交付内容

- **DNAEngine**（core/DNAEngine.ts）：首启生成永久 DNA（Life ID `PL-XXXX-XXXX`、seed、对称度、流场频率/强度、情绪基线、成长倾向、orbit/flow 偏好、生日）；`mulberry32` 确定性随机，同 seed 同 DNA；`applyDNA` 把 DNA 映射到引擎参数（流场/情绪基线/旋涡倾向）。
- **GrowthEngine**（core/GrowthEngine.ts）：成长 = 互动分钟（60%）+ 陪伴天数（40%）× DNA growthBias；只进不退；阶段 nascent → formed → ringed → dual；输出环显示量、双核解锁（growth ≥ 0.85）、粒子乘数。
- **MemoryEngine**（core/MemoryEngine.ts）：陪伴天数 / 总时长 / 互动 / 温和互动 / 受惊次数 / 夜间使用；输出信任修正（温和互动累计、受惊压低）与夜间发光倾向。
- **TimeSystem**（core/TimeSystem.ts）：晨/昼/暮/夜/深夜 → 睡眠倾向、亮度、活动量。
- **LifeStorage**（core/LifeStorage.ts）：schemaVersion 快照（DNA+记忆+lastActiveTime），localStorage 适配器 + 内存降级；损坏/版本不匹配的自愈路径（重新诞生）。
- **LifeEngine 集成**：DNA 映射参数；记忆逐帧累计；成长推进与双核轨道偏移；昼夜驱动睡眠倾向（呼吸速率随睡意放缓）、亮度（夜猫子记忆 → 夜间更亮）；`wakeFromOffline(分钟)` —— 回归时生命体从松散重新凝聚并逐渐亮起。
- **双后端可视化**：DNA 对称度（形体平滑度）、行星环（身体层 h 窗口展平环面）、双核心（副核粒子群）、夜间亮度乘——WebGPU 与 WebGL2 语义一致。
- **交互补充**（同批）：点击涟漪（世界坐标冲击波）、长按吸引场（排斥淡出 + 核心跟随）、pointerdown 位置同步修复。
- **诊断条**：新增 Life ID · 年龄 · 阶段显示（如 `PL-5070-F6BD · 0天 · dual`）。

## 验证

- **核心逻辑测试 9/9 通过**（`npm run test:core`，node:test + tsx）：DNA 确定性、存储往返/损坏/空档、记忆累计与信任对照、成长单调封顶、昼夜相位、日期键。
- 运行时验证（WebGPU）：
  - 首启诞生新生命 PL-5070-F6BD，localStorage 持久化，刷新后同一 Life ID ✅
  - 诊断条显示 `0天 · nascent` → 注入记忆后 `dual`、粒子数随成长乘数更新 ✅
  - 环 + 双核结构截图可辨（行星环展平 + 副核粒子群）✅
  - 昼夜系统跨越午夜实测：深夜亮度衰减、清晨恢复 ✅（含夜猫子倾向代码路径）
  - 点击涟漪：clickPos 世界坐标正确、pulse 0.9→0.42 衰减 ✅；长按 pressRamp=1、粒子围向指尖 ✅
- 期间修复：WGSL vec4/vec3 加法类型错误（双核锚点行）；测试刻度错误（tick=1/60s，2 小时需 43.2 万 tick）。

## 时间加速测试（同日补充）

新增 LifeClock（虚拟生命时钟 = 真实流逝 × N）与调试面板：
- 实测速率：真实 2 秒 → 虚拟 1000.5 秒，**精确 500×** ✅
- 「+1 天」快进后虚拟日期滚动、陪伴天数 +1、成长 0.95→0.98 ✅
- URL 参数：`?timelapse=N`、`?debug=1`、`?age=N`（里程碑直达）、`?offline=N`（回归问候）
- 用途：几分钟内观察完整生命历程（成长/昼夜/离线问候），不再需要真实等待天数。

## 未完成 / 已知项

- Windows（WebView2）验证：保留待办（无 Windows 环境；步骤见 mvp-acceptance.md）。
- DNA 的 particleDensity / movementStyle / tailProbability 尚未全部映射到视觉（已留接口，随成长可视化深化接线）。
- 音乐模式、完整观察空间、跨设备同步：Phase 10 后续批次。
- 功耗实测仍待系统级工具。
