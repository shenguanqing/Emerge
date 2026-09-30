# Emerge · Particle Life

一个由 GPU 粒子构成、具有自主行为与情绪反馈的抽象数字生命体。

> 粒子本身就是生命体。

它通过呼吸、流动、迟疑、躲避和重新凝聚，让用户感受到一个未知生命正在回应自己。视觉追求极简、神秘、有机与克制的科幻感。

## 当前状态

**MVP（Phase 1–9）与生命闭环（Phase 10a）已交付**：GPU 粒子模拟（WebGPU Compute + WebGL2 GPGPU 双后端）、三层有机形态、Curl Noise 流场、指针力场与感知延迟、驱散-重组、情绪与行为系统、Tauri 2 桌面窗口、自适应质量与低功耗调度；**永久 DNA（Life ID）、成长（行星环/双核）、记忆性格、现实昼夜、离线回归问候与持久化存档**。分阶段验证记录见 [docs/reports/](docs/reports/)。

你的生命体首次运行时诞生（Life ID 永久保存），可见陪伴、附近温和互动与有效音乐共同推动成长——成熟会解锁行星环与第二核心；凌晨它会困、变暗；几天不开、回来时它会从松散中重新凝聚向你打招呼。存档在浏览器 localStorage（30 秒自动保存）。

```bash
npm install
npm run dev        # Web 开发服务器（http://localhost:5173）
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物
npm run app:dev    # 实时调试桌面端（推荐日常使用）
npm run app:build  # 编译 debug 可执行文件（不打包）
npm exec tauri build -- --debug --bundles app # 打出可双击的 Emerge.app
```

## 实时调试（不必每次重新打包）

日常改代码用 **`npm run app:dev`**：

1. 自动起 Vite（`localhost:5173`），窗口加载的是开发服务器
2. 改 `src/**` 的 Vue / TS → **HMR 热更新**，窗口秒级刷新，不用重启
3. 改 `src-tauri/**` 的 Rust / Swift → Tauri **自动重编译并重启**窗口（比 `tauri build` 快很多）
4. Ctrl+C 停止

| 你改了什么 | 要不要 `app:dev` 重启 | 要不要打 `.app` |
| --- | --- | --- |
| Vue / TS / 样式 / shader 字符串 | 否，HMR 即可 | 否 |
| 仅看形态、情绪、成长 | 可只开 `npm run dev` 在浏览器测 | 否 |
| Rust / Swift / 依赖 / `Info.plist` | 自动重编，无需手动打包 | 否 |
| 托盘 | `app:dev` 可测试 | 否 |
| 系统音频、TCC 权限 | 裸开发程序可能不弹授权提示 | 使用 debug `.app` 验证 |
| 双击分发、给别人用 | — | `npm exec tauri build -- --debug --bundles app` |

注意：

- `app:dev` 跑的是裸程序 `src-tauri/target/debug/emerge`。本机观察到点击监听后无授权弹窗、权限列表无 Emerge；不能保证重启或重新开关权限即可解决。嵌入 Info.plist 不等于签名已绑定应用身份。
- 浏览器 `npm run dev` **没有**托盘 / 系统音频 / 穿透，只适合验视觉与 core 逻辑。
- 系统音频验证：先 Ctrl+C 停止开发实例，执行 `npm exec tauri build -- --debug --bundles app`，再 `open src-tauri/target/debug/bundle/macos/Emerge.app`。点击「监听系统声音」后按系统提示授权；若没有登记，可在系统设置的「屏幕与系统音频录制」列表用 `+` 手动添加此 `.app`，开启后退出并重新打开。授权须用户自行完成。
- debug `.app` 使用构建后的前端，不提供 Vite 热更新。它仍是 ad-hoc 签名，不能承诺重编译后权限永久有效。

Web 端可用 `?backend=webgpu|webgl2` 强制指定模拟后端；左下诊断条显示后端、状态（平静/好奇/警觉/受惊）、FPS、粒子数、质量档位与目标帧率。

## 体验要点

- 启动：黑暗中粒子逐个显现 → 旋涡收拢 → 约 7.5 秒凝聚成呼吸的生命体。
- 缓慢靠近：它感知你、试探、好奇时核心会主动靠近。
- 高速划过：身体被冲散、核心暴露，约 3 秒旋涡式重组，之后与你保持更远距离。
- 长时间不互动：它进入低功耗（60→30→15 FPS），动作放缓。
- 质量档位自动升降（Low 8k → Ultra 100k 粒子）。

## 测试时间加速（不用一天天等）

成长与昼夜走的是虚拟生命时钟，可用 URL 参数加速：

```bash
npm run dev
# 打开 http://localhost:5173/?timelapse=500&debug=1
```

- `?timelapse=N`：时间倍率——500 表示真实 1 秒 = 生命体 500 秒（一天约 3 分钟），陪伴天数、互动累计、昼夜循环全部加速。
- `?debug=1`：右下角调试面板——「+1 天」「+60 分钟互动」「模拟离开 3 天」（触发离线回归问候）「重置生命」。
- `?age=N`：新生生命直接带到 N 天里程碑（看环/双核形态）。
- `?offline=N`：启动即模拟离开 N 分钟的回归问候。

组合示例：`?timelapse=500&debug=1&age=12` —— 直接观察接近完全体的形态。

## 桌面端使用

macOS **托盘图标左键**弹出菜单：

- 生命信息 / 系统声音状态
- **显示 / 隐藏**
- **监听系统声音** / **选择音乐文件…** / **停止音乐** / 打开系统声音权限设置…
- **设置**：外观（团大小、亮度、点大小、配色）、行为（置顶、鼠标穿透）、桌面位置、成长与积累说明
- **退出**

窗口铺满主屏、无边框透明。**按住并拖动**可把生命体放到任意位置。默认鼠标穿透，避免挡住桌面。

## 音乐响应

托盘「选择音乐文件…」或「监听系统声音」——生命体会"听"：

- **Bass** → 身体随低音脉冲
- **Beat** → 核心打出能量波（旋涡骤然活跃）
- **Treble** → 外围粒子变得活跃
- 高能音乐 → 兴奋；安静 → 平静

音频只影响行为参数。macOS 13+ 通过 ScreenCaptureKit 获取系统音频频段能量；需在「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」允许 Emerge。无屏幕帧、无录音文件、无上传。

Windows 系统音频尚未实现，Web 和 Windows 可继续使用音乐文件。

Web 与桌面 localStorage 相互独立，可能有不同 Life ID、年龄和成长阶段；修复统一了渲染参数，但不会覆盖已有生命存档，因此两端不保证外观逐帧相同。

## 平台

- **Web**：完整体验（Chrome/Edge 推荐，WebGPU 优先，WebGL2 后备）。
- **macOS / Windows**：Tauri 2 桌面窗口。macOS 已修复页面黑底、画布输入遮挡与拖动权限，最新验证边界见 [桌面修复记录](docs/reports/desktop-fixes.md)；Windows 待验证。

## MVP 验收

自动化 soak（5 分钟混合场景）通过：0 错误、情绪自主转换、冲击-重组循环稳定、低功耗调度生效。记录见 [docs/reports/mvp-acceptance.md](docs/reports/mvp-acceptance.md)；「五分钟真人体验」验收待用户实际运行补充。

## 文档导航

- [文档索引](docs/README.md)
- [产品定义与 MVP 边界](docs/PRODUCT.md)
- [技术架构与平台策略](docs/ARCHITECTURE.md)
- [视觉与交互规格](docs/VISUAL_INTERACTION.md)
- [分阶段开发路线](docs/ROADMAP.md)
- [验收与性能验证](docs/VALIDATION.md)
- [初始技术决策](docs/decisions/0001-technical-direction.md)
- [原始需求](docs/ORIGINAL_BRIEF.md)
- [协作约定](AGENTS.md) · [变更记录](CHANGELOG.md)


## 三条成长路径

- 可见陪伴：显示时累计，隐藏、关闭与休眠不补发积分；仅靠陪伴也能成熟。
- 温和互动：只统计粒子附近的真实低速动作和轻点后的短暂回应。鼠标静止或远处移动不算互动；每日前 20 分钟贡献较高。
- 音乐陪伴：连续有声两秒后开始按时长计分，静音不算；每日前 30 分钟贡献较高，之后递减。系统声音和文件音乐都适用，持续语音等声音也会计入，音量大小不增加积分倍率。

设置中的「成长」可查看成长度、陪伴、互动和有效音乐时长。DNA 影响速度但不限制最终上限。旧存档自动迁移并保留生命身份和旧成长下限。详细规则与验证边界见 [三路径成长决策](docs/decisions/0003-growth-paths.md)。
