/**
 * 质量管理：Low / Medium / High / Ultra 四档控制粒子预算与渲染开销，
 * FPS 采样 + 滞回升降档；无交互时 60 → 30 → 15 FPS 低功耗调度，
 * 任何交互立即恢复。core 模块纯 TypeScript，不依赖渲染器与 DOM。
 */

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface TierConfig {
  /** 活跃粒子数（缓冲按 MAX_PARTICLES 分配，仅渲染前 N 个）。 */
  particles: number;
  /** 粒子基础尺寸（像素）。 */
  pointSize: number;
  /** 该档位允许的最大 DPR。 */
  maxDpr: number;
}

export const MAX_PARTICLES = 100_000;

export const QUALITY_TIERS: Record<QualityTier, TierConfig> = {
  low: { particles: 8192, pointSize: 2.2, maxDpr: 1.5 },
  medium: { particles: 16384, pointSize: 2.6, maxDpr: 1.75 },
  high: { particles: 32768, pointSize: 3.0, maxDpr: 2 },
  ultra: { particles: MAX_PARTICLES, pointSize: 3.0, maxDpr: 2 },
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualitySampleResult {
  /** 档位是否变化（调用方需应用粒子数/尺寸/DPR）。 */
  tierChanged: boolean;
  /** 目标帧率是否变化（调用方需应用帧限制）。 */
  targetFpsChanged: boolean;
  tier: QualityTier;
  targetFps: number;
}

export class QualityManager {
  tier: QualityTier = 'high';
  /** 低功耗目标帧率：60（活跃）→ 30（闲置 20s）→ 15（闲置 60s）。 */
  targetFps = 60;

  /** 降档阈值：活跃时平均 FPS 低于该值持续 slowSeconds 降一档。 */
  downFps = 45;
  /** 升档阈值：平均 FPS 高于该值持续 fastSeconds 升一档。 */
  upFps = 58;
  /** 档位切换最小间隔（秒），防止抖动。 */
  minDwell = 4;

  private slowTimer = 0;
  private fastTimer = 0;
  private dwell = 0;
  private idleFps30 = false;
  private idleFps15 = false;

  /**
   * 每帧采样。
   * @param fps 当前滑动窗口平均帧率
   * @param idleSeconds 距上次用户交互的秒数
   */
  sample(fps: number, idleSeconds: number, dt: number): QualitySampleResult {
    const before: [QualityTier, number] = [this.tier, this.targetFps];

    // ---- 低功耗帧调度：闲置逐步降帧，交互立即恢复 ----
    if (idleSeconds >= 60) {
      this.targetFps = 15;
      this.idleFps15 = true;
    } else if (idleSeconds >= 20) {
      this.targetFps = 30;
      this.idleFps30 = true;
    } else {
      this.targetFps = 60;
      this.idleFps30 = false;
      this.idleFps15 = false;
    }
    void this.idleFps30;
    void this.idleFps15;

    // ---- 滞回升降档（仅活跃期评估）----
    this.dwell += dt;
    const active = idleSeconds < 5;
    if (this.dwell >= this.minDwell && active) {
      if (fps < this.downFps) {
        this.slowTimer += dt;
        this.fastTimer = 0;
      } else if (fps >= this.upFps) {
        this.fastTimer += dt;
        this.slowTimer = 0;
      } else {
        this.slowTimer = 0;
        this.fastTimer = 0;
      }

      const idx = TIER_ORDER.indexOf(this.tier);
      if (this.slowTimer >= 2 && idx > 0) {
        this.tier = TIER_ORDER[idx - 1];
        this.dwell = 0;
        this.slowTimer = 0;
      } else if (this.fastTimer >= 6 && idx < TIER_ORDER.length - 1) {
        this.tier = TIER_ORDER[idx + 1];
        this.dwell = 0;
        this.fastTimer = 0;
      }
    }

    return {
      tierChanged: before[0] !== this.tier,
      targetFpsChanged: before[1] !== this.targetFps,
      tier: this.tier,
      targetFps: this.targetFps,
    };
  }

  /** 强制设置档位（诊断用）。 */
  forceTier(tier: QualityTier): void {
    this.tier = tier;
    this.dwell = 0;
  }
}
