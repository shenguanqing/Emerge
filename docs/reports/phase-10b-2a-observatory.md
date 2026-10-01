# Phase 10b-2a：Observatory 观察空间（2026-09-30）

## 范围与状态

- 交付：暗色观察空间入口（双击）、球坐标旋转/缩放、Age / Energy / Mood / Trust / DNA / Evolution 边缘信息栏。
- 状态：Web 路径 **通过**（WebGPU 与 WebGL2 均实测）。
- 明确不在本次范围：分享/同步、Windows、桌面穿透下双击手势的原生合成、观察空间内的音乐控制。

## 交互契约

| 操作 | 行为 |
| --- | --- |
| 双击画面 | 进入观察空间（相机拉至 5.4） |
| 单击 | 仍为涟漪；延迟 300ms 放行，避免与双击叠加 |
| 拖动 | 旋转（方位/仰角钳制） |
| 滚轮 / `+` `-` | 缩放（距离 2.2–16） |
| 方向键 | 微调视角 |
| Esc / 「关闭」 | 退出并复位相机（7） |
| 「复位视角」 | 回到默认球坐标 |

观察空间打开时：不再触发长按吸引与点击涟漪；桌面端临时关闭鼠标穿透以便点侧栏，关闭后恢复用户偏好。

## 实现要点

- `src/render/ViewState.ts`：球坐标相机、lookAt 视图矩阵、视平面反投影（指针力场与相机同步）。
- `WebGL2Backend.setView` / `WebGPUBackend.setView`：两端同一语义；WebGPU 用 `viewMatrix()` 写入 VP uniform。
- `PointerSystem`：跟随相机距离与朝向换算世界坐标；双击在 300ms 内第二次按下即识别并抑制单击涟漪。
- `src/ui/Observatory.vue`：单侧玻璃拟态信息栏，无卡片仪表盘；信息为年龄、状态、能量、信任、DNA 五维、Evolution（成长/环/臂/双核/陪伴）。

## 验证

| 项 | 结果 |
| --- | --- |
| `npm run build`（vue-tsc + vite） | 通过 |
| `npm run test:core` | 22/22 |
| WebGPU 双击进入 | 观察空间出现，`getView()` 可读 |
| WebGL2 旋转 + 缩放 | azimuth/elevation/distance 实际变化（例：0→-0.96，7→6.44） |
| Esc 退出 | 面板关闭，相机复位 (0,0,7) |
| 初始距离 | 进入时 5.4（已修 Observatory 首帧覆盖为 7 的问题） |
| 合成 pointer 事件 | `setPointerCapture` 抛 NotFound，已 try/catch |

## 未验证

1. 桌面 Tauri 内双击与穿透切换的端到端手感（代码路径在，未实机点按）。
2. 观察空间下长时间旋转对 FPS 的影响（未做压测）。
3. 信息栏窄窗（34vw / 300px）在超小窗口的排版。

## 下一步候选

- 桌面原生窗内验收双击进入。
- 观察空间与成长动画联动（例如环量变化时角向高亮）。
- 双击手势与「受惊」的边界再调（连续快速单击）。
