# Emerge · Particle Life

一个由 GPU 粒子构成、具有自主行为与情绪反馈的抽象数字生命体。

> 粒子本身就是生命体。

通过呼吸、流动、迟疑、躲避和重新凝聚，呈现未知生命的回应。优先面向 macOS、Windows 和 Web；具体实现进度与平台验证范围见 [开发路线](docs/ROADMAP.md)，按日期的变更和实际验收结果见 [变更记录](CHANGELOG.md)。

## 安装与运行

Web 开发需要 Node.js 20.19+（20.x）或 22.12+ 与 npm；桌面开发还需要 Rust 和目标平台的 Tauri 2 构建环境。macOS 的 Swift 系统音频模块使用 Xcode Command Line Tools 编译。

```bash
npm install
npm run dev        # Web 开发服务器：http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物
npm run app:dev    # 桌面实时调试
npm run app:build  # 编译 debug 可执行文件，不打包
```

macOS 可双击的 debug 应用包：

```bash
npm exec tauri build -- --debug --bundles app
open src-tauri/target/debug/bundle/macos/Emerge.app
```

## 使用

缓慢靠近可观察注意方向与局部粒子的回应；轻点产生涟漪，长按产生吸引场，高速划过会驱散身体，再通过力场逐渐重新聚合。质量与目标帧率随负载和活动调整。

桌面通过托盘菜单显示/隐藏生命体、打开设置、控制声音或退出；默认鼠标穿透。位置由设置或首次引导的桌面摆放图调整，支持拖动、点按和方向键微调，摆放后固定停留。

macOS 粒子主窗采用跨桌面显示策略，切换普通虚拟桌面时沿用同一个生命体与摆放位置；主动隐藏后在其它桌面也保持隐藏。修改桌面窗口配置后需重启桌面应用。各平台及特殊空间的验证范围见 ROADMAP「已知坑」。

设置提供大小、亮度、点大小、配色、置顶、穿透、位置和成长信息。「通用」可切换中文 / English / 日本語 / 한국어、浅深色主题，并重新查看欢迎引导。

双击粒子团进入观察空间，拖动旋转、滚轮缩放，按 Esc、双击或关闭按钮返回桌面；关闭观察空间不停止当前音乐。macOS 应用菜单还提供设置（Cmd+,）与观察空间（Cmd+O）入口。

## 首次启动与存档

没有生命存档的新用户在桌面启动时进入欢迎引导：认识 → 大小、配色与摆放 → 可跳过的音乐入口。完成或跳过后打开设置；未完成关闭，下次启动再次显示。已有生命存档的升级用户可从设置手动打开引导。

生命身份、DNA 与聚合成长记录保存在该运行环境的 localStorage，每 30 秒自动保存，并在隐藏/退出时保存。外观设置与生命存档分别存储；引导完成标记位于桌面应用配置目录的 `onboarding.json`。重新查看引导不重置生命。

Web 与桌面的存档相互独立，不共享 Life ID 或成长记录；存储不可用时回退内存，关闭后无法保留本次记录。迁移与计分规则见 [技术架构](docs/ARCHITECTURE.md#数据与持久化)。

可见陪伴、附近温和互动与持续有效声音推动成长。形态从 Origin / Awaken 逐步组织成 Conscious / Emerge 的脉络与断续轨道；设置中的成长区可查看统计。产品边界见 [产品定义](docs/PRODUCT.md)。

## 音乐与权限

托盘与观察空间可选择音乐文件；macOS 13+ 可通过 ScreenCaptureKit 监听系统声音。低音影响身体脉冲，节拍影响核心能量波，高频影响外围活动，音频只驱动行为参数。只分析频段能量，不接收屏幕帧、不保存录音、不上传。

系统监听连接中或监听时，文件选择、文件播放/暂停与停止操作受互斥限制；先停止系统监听再切换音乐文件。Windows 系统音频捕获尚未实现；Web 可使用音乐文件，Windows 文件播放仍须目标系统验证。

系统声音只在用户选择监听时请求权限。macOS 按系统提示在「隐私与安全性 → 屏幕与系统音频录制」允许 Emerge；如提示重启，完全退出再打开。权限须用户自行授予。

裸开发程序可能不弹权限提示或无法登记，嵌入 Info.plist 不等于签名已绑定应用身份。验证系统音频时先停止开发实例，再使用上述 debug `.app`；如未登记，可在系统权限列表用 `+` 手动添加。debug 包采用 ad-hoc 签名，重编译后可能需要重新授权。

## 开发与预览

`npm run app:dev` 自动启动 Vite；Vue / TypeScript / 样式修改通过 HMR 更新，Rust / Swift 修改会触发桌面重编译和重启，Ctrl+C 停止。debug `.app` 加载构建产物，不提供 Vite 热更新。浏览器不具备托盘、桌面穿透或系统音频入口。

| 预览参数 | 用途 |
| --- | --- |
| `?backend=webgpu` / `?backend=webgl2` | 强制后端，检查双后端表现 |
| `?debug=1` | 诊断条与时间调试面板 |
| `?growth=0.6` | 直接观察指定成长度的形态 |
| `?age=12` | 注入使用日与互动记录，检查成长路径 |
| `?timelapse=500` | 虚拟生命时钟加速 |
| `?offline=4320` | 模拟离开 4320 分钟后的回归 |
| `?window=settings` | 设置页预览 |
| `?window=welcome&preview=1` | 引导预览；配色/位置不落盘、不调用桌面音乐 |

含 `growth`、`age`、`offline` 或 `timelapse` 的主窗预览使用存档副本，不写回真实成长记录。`age` 是测试注入，不保证指定日期必然对应某个形态。Web 主入口不自动显示桌面引导。

## 检查与验证

```bash
npm run build      # 类型检查与构建
npm run test:core  # 核心行为、随机、存档与成长
npm run test:input # 音频与双击模式切换
npm run test:i18n  # 四语词条、插值与代码引用
cargo test --offline --manifest-path src-tauri/Cargo.toml # 原生回归（须已缓存依赖）
```

视觉、真实性能与桌面能力按 [验收标准](docs/VALIDATION.md) 实测；构建与测试通过不代表生命感或全部平台验收通过。

本地资源采样仅读取指定进程及可归属子进程：

```bash
python3 scripts/macos-soak.py --pid <Emerge进程编号> --hours 2 --interval 60 --output output/macos-soak.jsonl
```

添加 `--follow-restarts --executable <可执行文件绝对路径>` 可在采样窗口内跟随同一应用重启。`output/` 保留在本地；独立 WebKit/GPU 进程未计入，CPU 不能代表功耗，多个短会话不能作为连续运行通过。采样结果记入 CHANGELOG，待验收项维护在 ROADMAP。

## 文档导航

| 文档 | 职责 |
| --- | --- |
| [ROADMAP](docs/ROADMAP.md) | 当前阶段、任务、待验收项与已知坑 |
| [CHANGELOG](CHANGELOG.md) | 按日期的变更、重要决策与实际验证结果 |
| [PRODUCT](docs/PRODUCT.md) | 产品目标与范围边界 |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 技术契约、模块与数据流 |
| [VISUAL_INTERACTION](docs/VISUAL_INTERACTION.md) | 粒子视觉、行为交互与创意基线 |
| [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) | 设置、引导与观察空间的界面规范 |
| [VALIDATION](docs/VALIDATION.md) | 验收方法、标准与记录格式 |
| [ORIGINAL_BRIEF](docs/ORIGINAL_BRIEF.md) | 原始需求只读存档 |
| [AGENTS](AGENTS.md) | 项目协作与文档维护约定 |
