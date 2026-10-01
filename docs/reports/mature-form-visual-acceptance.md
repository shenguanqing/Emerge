# 成熟形态视觉验收（2026-09-30）

范围：真实成长度下的行星环、双核、旋臂、卫星与火花样式；WebGPU 与 WebGL2 对照。不在范围：Windows、桌面原生窗、混 DPI 多屏。

## 结论摘要

**成熟形态结构在两种后端均可见且语义一致，本项验收通过。**

`?growth=N` 驱动下，初生 → 成形 → 环生 → 双核四阶段参数与画面逐级出现：环量 0→1、双核 0→1、旋臂 1→3。WebGPU 与 WebGL2 的径向分布、双核峰位、旋臂对比度同量级，未见某端缺结构。

**「不同屏幕尺寸」未完成**：自动化 `resize` 未生效，截图均为 1280×720。该项保留未验证。

## 结构参数（实机读取 `LifeEngine.getState()`）

| growth | ring | dualCore | arms | stage | 诊断条 |
| --- | --- | --- | --- | --- | --- |
| 0.20 | 0 | 0 | 1 | nascent | 初生 · 成长 20% |
| 0.45 | 0 | 0 | 1 | formed | 成形 · 成长 45% |
| 0.70 | 0.43 | 0 | 2 | ringed | 环生 · 成长 70% |
| 0.90 | 1 | 1 | 3 | dual | 双核 · 成长 90% |
| 1.00 | 1 | 1 | 3 | dual | 双核 · 成长 100% |

与 `GrowthEngine` 公式一致：`ring=(growth-0.55)/0.35`，`dualCore=growth>=0.85`，`arms` 由 `tailProbability` 决定上限。

## 视觉对照方法

- 启动：`npm run dev` → `http://localhost:5173/?growth=N&bodyScale=1&posX=0.5&posY=0.5&debug=1&backend=webgpu|webgl2`
- 每组合等待约 10 s（完成启动凝聚），截全窗 + 中心裁切。
- 量化代理（供交叉核对，不替代目视）：暖色粒子径向分布、亮度峰间距、外区角向对比度。

## 量化摘要

| 组合 | 双核峰间距特征 | 旋臂对比度* | 备注 |
| --- | --- | --- | --- |
| nascent 20% | 峰在质心附近 | 2.43 | 紧凑单核 |
| formed 45% | 峰在质心附近 | 2.22 | 轮廓稳定 |
| ringed 70% GPU/GL2 | 峰在质心附近 | 2.25 / 2.09 | 环量约 0.43 |
| dual 90% GPU | 两峰相距约 90 px | 3.51 | 双核 + 3 臂 |
| dual 100% GPU | 两峰分离 | 3.43 | 环满、双核 |
| dual 100% GL2 | 两峰分离 | 2.51 | 与 GPU 同结构 |

\* 旋臂对比度 = 外区角向直方图 max/mean；越高表示角向越不均匀（臂更明显）。

## 后端一致性

| 检查 | WebGPU Compute | WebGL2 GPGPU |
| --- | --- | --- |
| 后端识别 | apple metal-3 强制 webgpu | 强制 webgl2 |
| 阶段/成长显示 | 与 growth 一致 | 与 growth 一致 |
| 环生 70% | 环量 0.43、2 臂 | 同参数，画面同结构族 |
| 双核 100% | ring=1, dual=1, arms=3 | 同 |
| 粒子数（g=1.0） | 88,474 | 88,474 |
| FPS（短时） | 60 | 60 |

## 证据图

目录：`mature-form-retest/`

| 文件 | 说明 |
| --- | --- |
| `contact-sheet.png` / `contact-sheet-small.jpg` | 八格对比拼图 |
| `nascent-g20.png` | 初生 20% |
| `formed-g45.png` | 成形 45% |
| `ringed-g70.png` / `ringed-g70-webgl2.png` | 环生 70% 双后端 |
| `dual-g90-webgpu.png` / `dual-g90-webgl2.png` | 双核 90% 双后端 |
| `dual-g100-webgpu.png` / `dual-g100-webgl2.png` | 双核 100% 双后端 |
| `view-*` / `crop-*` / `big-*` | 预览与中心放大 |

## 环境

| 项目 | 记录 |
| --- | --- |
| 系统 | macOS 15.8.1（24H32），Apple M1 Pro |
| 浏览器 | Playwright Chromium（自动化）+ 本机 WebGPU/WebGL2 |
| 视口 | 1280×720、DPR 1.00（原计划的 800×600 / 1920×1080 因 resize 未生效未取得） |
| 命令 | `npm run test:core` 22/22 通过 |

## 仍为未验证

1. **不同屏幕尺寸**：自动化 resize 失败，仅有 1280×720。
2. **火花样式主观目视**：已有代码（逐粒子亮度差 + 相位闪烁）；本报告未做独立的「火花」美学评审，建议人工看 `big-dual100-gpu.png` 确认。
3. **桌面原生窗内的成熟形态**：本次为 Web 调试页；桌面 WKWebView 仍为 WebGL2 路径，未截图。
4. **真实成长度长期观感**：`?growth=N` 是注入下限，与真实多日养成的粒子记忆/性格叠加效果未比对。

## 建议

- ROADMAP「成熟形态视觉」可从「完全未验证」降为「结构与双后端一致已验证；尺寸/桌面/长期待补」。
- 若需收口多尺寸，改用 Playwright 建 context 时指定 viewport（而非会话内 resize）再截。
