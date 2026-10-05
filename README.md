# Emerge · Particle Life

一个由 GPU 粒子构成、具有自主行为与情绪反馈的抽象数字生命体。

> 粒子本身就是生命体。

通过呼吸、流动、迟疑、躲避和重新凝聚，呈现未知生命的回应。优先面向 macOS、Windows 和 Web；实现进度与平台验证范围见 [开发路线](docs/ROADMAP.md)，按日期的变更与验收结果见 [变更记录](CHANGELOG.md)。

## 安装与运行

Web 开发需要 Node.js 20.19+（20.x）或 22.12+ 与 npm；桌面开发还需要 Rust 与目标平台的 Tauri 2 构建环境，macOS 的 Swift 系统音频模块使用 Xcode Command Line Tools 编译。

```bash
npm install
npm run dev        # Web 开发服务器：http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物

npm run app:dev    # 桌面开发运行，加载已确认的粒子版本
npm run app:build  # 编译 debug 可执行文件，不打包
npm run app:dmg    # macOS release 应用包与 DMG
```

需要可双击的 macOS debug 应用包时：

```bash
npm exec tauri build -- --debug --bundles app
open src-tauri/target/debug/bundle/macos/Emerge.app
```

`app:dmg` 生成 release `.app` 与 `.dmg`（默认在 `src-tauri/target/release/bundle/` 下，设置 `CARGO_TARGET_DIR` 时位于指定目录的 `release/bundle/`），应用包使用项目图标并包含系统声音用途说明，可将 `Emerge.app` 拖入 Applications；安装形式见 [Tauri DMG 文档](https://v2.tauri.app/distribute/dmg/)。当前为 ad-hoc 签名、未公证，不作为公开分发验收。打包失败、缓存清理与权限问题见 [故障排查](#故障排查与维护)。

## 使用

- **互动**：缓慢靠近可观察注意方向与局部粒子回应；轻点产生涟漪，长按产生吸引场，高速划过会驱散身体，再通过力场逐渐重新聚合。按住粒子团拖动可环绕转动视角（松手保留角度）。
- **观察空间**：双击粒子团进入，拖动旋转、滚轮缩放（触屏双指捏合），Esc、双击或关闭按钮返回；窄屏（手机）侧栏默认收起为右上角一枚按钮，点按展开。关闭观察空间不停止当前音乐。
- **设置与托盘**：桌面托盘菜单可显示/隐藏生命体、打开设置、控制声音与退出；网页右上角提供设置、音乐与运行状态三个入口（音乐弹层可选择本地音乐文件并控制播放）。设置提供大小、亮度、点大小、配色、位置与成长信息，「通用」切换中文 / English / 日本語 / 한국어、浅深色主题并重新查看引导。桌面另有置顶与穿透开关（默认鼠标穿透）。
- **位置**：设置或首次引导的摆放图支持拖动、点按与方向键微调，摆放后固定停留（桌面为屏幕位置，网页为浏览器窗口内位置）。macOS 主窗跨普通虚拟桌面沿用同一生命体与位置，主动隐藏后保持隐藏。
- **移动端**：网页带图标与 manifest，可在浏览器「添加到主屏幕」全屏使用。

质量与目标帧率随负载和活动自动调整；图形服务被系统回收时会出现恢复提示，重新载入即可。

## 首次启动与存档

没有生命存档的新用户在桌面启动或网页首次访问时进入欢迎引导：认识 → 大小、配色与摆放 → 可跳过的音乐入口（系统声音仅桌面）。完成或跳过后引导直接关闭；未完成关闭则下次启动再次显示。已有生命存档的升级用户可从设置手动打开引导，重新查看引导不重置生命。

生命身份、DNA 与成长记录保存在运行环境的 localStorage，每 30 秒及隐藏/退出时自动保存；Web 与桌面存档相互独立，不共享 Life ID 或成长记录。同一浏览器的多个标签页只有最前的持有者运行生命体并写档，其余显示提示并暂停，持有者关闭后自动接管；存储不可用时回退内存，关闭后不保留本次记录。可见陪伴、附近温和互动与持续有效声音推动成长，形态从 Origin / Awaken 逐步组织成 Conscious / Emerge，统计见设置的成长区。迁移与计分规则见 [技术架构](docs/ARCHITECTURE.md#数据与持久化)，产品边界见 [产品定义](docs/PRODUCT.md)。

## 音乐与权限

托盘与观察空间可选择音乐文件；macOS 13+ 可通过 ScreenCaptureKit 监听系统声音。低音影响身体脉冲，节拍影响核心能量波，高频影响外围活动——音频只驱动行为参数：只分析频段能量，不接收屏幕帧、不保存录音、不上传。

系统监听连接中或监听时，文件选择与播放操作受互斥限制，先停止监听再切换音乐文件。Windows 系统音频捕获尚未实现，Web 可使用音乐文件。权限只在选择监听时请求：按系统提示在「隐私与安全性 → 屏幕与系统音频录制」允许 Emerge，如提示重启则完全退出再打开。

## 开发与预览

`npm run app:dev` 自动启动 Vite：前端改动 HMR 更新，Rust / Swift 改动触发桌面重编译并重启，Ctrl+C 停止；`-- --diagnostic` 暂停粒子/音频初始化用于排障（切换启动模式需先退出旧服务再重新运行）。debug `.app` 加载构建产物，不提供热更新；浏览器不具备托盘、穿透或系统音频入口。

| 预览参数 | 用途 |
| --- | --- |
| `?backend=webgpu` / `?backend=webgl2` | 强制后端，检查双后端表现 |
| `?debug=1` | 使用生命存档副本，运行状态弹层下方提供时间加速工具 |
| `?growth=0.6` | 直接观察指定成长度的形态 |
| `?age=12` | 注入使用日与互动记录，检查成长路径（不保证日期对应形态） |
| `?timelapse=500` | 虚拟生命时钟加速 |
| `?offline=4320` | 模拟离开 4320 分钟后的回归 |
| `?window=settings` | 独立设置页，可跨标签页与主页面同步 |
| `?window=welcome&preview=1` | 引导预览；配色/位置不落盘、不调用桌面音乐 |

含 `debug=1`、`growth`、`age`、`offline` 或 `timelapse` 的主窗预览均使用存档副本：不写回真实成长记录、不触发真实首次引导，预览读数不跨标签页写入。主界面沿用普通 UI，`?debug=1` 只在运行状态弹层下方追加时间加速；设置页连点底部提示 5 次可解锁同一套时间控件（倍率、增加使用日/互动、模拟离开、两段确认重置）——普通会话中操作的是真实生命记录，独立验收请使用预览参数。

## 检查与验证

```bash
npm run build         # Vue / TypeScript 类型检查与生产构建
npm test              # 全部前端自动化测试（音频已包含在输入组）
npm run test:core     # 核心行为、随机、时间、存档、成长与质量调度
npm run test:platform # 多标签页互斥、心跳接管与锁释放
npm run test:input    # 音频、双击、拖动旋转与相机换算
npm run test:i18n     # 四语词条、插值与代码引用
npm run test:render   # 着色器接口、共享参数与双后端 GPU 提交回归
cargo test --manifest-path src-tauri/Cargo.toml # 原生回归（首次需拉取依赖，缓存后可加 --offline）
```

`npm run app:build` 检查当前目标系统的桌面编译。前端自动化不启动真实 GPU 或原生窗口；视觉、真实性能、权限、透明桌面与打包后运行能力按 [验收标准](docs/VALIDATION.md) 实测，构建与测试通过不代表生命感或全部平台验收通过。长时资源采样用 `python3 scripts/macos-soak.py --pid <Emerge进程编号> --hours 2 --interval 60 --output output/macos-soak.jsonl`（`--follow-restarts --executable <路径>` 跟随重启；不含独立 WebKit/GPU 进程，CPU 不代表功耗），结果记入 CHANGELOG。

## 故障排查与维护

- **打包**：`bundle/macos/rw.<进程编号>.dmg` 是创建/压缩过程中的可写临时镜像，失败时不能改名当作发行包。用 `npm run app:dmg -- --verbose` 查看具体失败步骤；`hdiutil info` 可按 `image-path` 定位残留挂载，确认无占用后卸载再删除临时文件。
- **缓存清理**：`dist/`、`.history/`、`node_modules/.vite/` 与 Cargo `target/` 下的 `build/`、`deps/`、`incremental/`、`.fingerprint/` 均可重建。清理 Cargo 缓存前先停止 `app:dev` 等编译监视服务，避免自动重编译立刻生成缓存；保留运行中的可执行文件、挂载中的镜像、需保留的应用包/DMG 与验收证据。
- **系统音频权限**：裸开发程序可能不弹权限提示或无法登记，验证系统音频时先停止开发实例、改用上述 debug `.app`；未登记时在系统权限列表用 `+` 手动添加。debug 包 ad-hoc 签名，重编译后可能需重新授权。
- **目录分工**：本地截图、日志、性能采样等验收文件统一放 `output/`（Git 忽略，结论记入 CHANGELOG）；开发/打包/检查脚本放 `scripts/` 并入库。

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
