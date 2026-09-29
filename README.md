# Emerge · Particle Life

一个由 GPU 粒子构成、具有自主行为与情绪反馈的抽象数字生命体。

> 粒子本身就是生命体。

它通过呼吸、流动、迟疑、躲避和重新凝聚，让用户感受到一个未知生命正在回应自己。视觉追求极简、神秘、有机与克制的科幻感。

## 当前状态

**MVP（Phase 1–9）与生命闭环（Phase 10a）已交付**：GPU 粒子模拟（WebGPU Compute + WebGL2 GPGPU 双后端）、三层有机形态、Curl Noise 流场、指针力场与感知延迟、驱散-重组、情绪与行为系统、Tauri 2 桌面窗口、自适应质量与低功耗调度；**永久 DNA（Life ID）、成长（行星环/双核）、记忆性格、现实昼夜、离线回归问候与持久化存档**。分阶段验证记录见 [docs/reports/](docs/reports/)。

你的生命体首次运行时诞生（Life ID 永久保存），陪伴与互动让它成长——多互动会解锁行星环与第二核心；凌晨它会困、变暗；几天不开、回来时它会从松散中重新凝聚向你打招呼。存档在浏览器 localStorage（30 秒自动保存）。

```bash
npm install
npm run dev        # Web 开发服务器（http://localhost:5173）
npm run build      # 类型检查 + 生产构建
npm run preview    # 预览构建产物
npm run app:build  # Tauri 桌面应用（debug，构建后运行 src-tauri/target/debug/emerge）
npm run app:dev    # Tauri 开发模式
```

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

macOS 菜单栏有 **Emerge 托盘图标**（发光小圆点）：

- **显示 / 隐藏**：让生命体出现或消失
- **置顶**：开关总在最前
- **鼠标穿透**：开启后鼠标点击会穿过它直达桌面（再从托盘关闭恢复）——真正"住在桌面上"的模式
- **退出 Emerge**

窗口位置和大小跨启动自动记忆。系统音频响应（放任何 App 的歌它都能听到）为桌面版后续能力。

## 音乐响应

右上角 ♪ 按钮选择一个音乐文件（页面内播放）——生命体会"听"它：

- **Bass** → 身体随低音脉冲
- **Beat** → 核心打出能量波（旋涡骤然活跃）
- **Treble** → 外围粒子变得活跃
- 高能音乐 → 兴奋；安静 → 平静

它是在听音乐，不是音乐可视化器——音频只影响行为参数。系统音频捕获（放任何 App 的歌它都能听到）属桌面版后续能力。

## 平台

- **Web**：完整体验（Chrome/Edge 推荐，WebGPU 优先，WebGL2 后备）。
- **macOS / Windows**：Tauri 2 桌面窗口。macOS 已验证运行与交互；透明合成受 WKWebView 层限制（黑底，诊断见 [docs/reports/phase-8.md](docs/reports/phase-8.md)）；Windows 待验证。

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
