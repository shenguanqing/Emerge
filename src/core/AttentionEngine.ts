import { mulberry32 } from './DNAEngine';

/** 注意与组织节律，只描述可见行为，不代表语言理解或推理能力。 */
export class AttentionEngine {
  private readonly random: () => number;
  private remaining = 2;
  private mode = 0;
  private targetAngle = 0;
  private noticed = false;
  readonly state = { focusAngle: 0, attention: 0, thoughtPhase: 0, thoughtPulse: 0, contemplation: 0, structureTime: 0 };

  constructor(seed: number) { this.random = mulberry32(seed); this.targetAngle = this.random() * Math.PI * 2; }

  update(dtSeconds: number, nearby: number, pointerAngle: number, scared: number, sleepiness: number): void {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    if (!dt) return;
    const s = this.state;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.mode = (this.mode + 1) % 3;
      this.remaining = (this.mode === 1 ? 2 : 4) + this.random() * 5;
      this.targetAngle += (this.random() - 0.5) * 2.8;
      s.thoughtPulse = Math.max(s.thoughtPulse, this.mode === 2 ? 0.8 : 0.35);
    }
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const attentionTarget = clamp(nearby) * (1 - clamp(scared)) * (1 - clamp(sleepiness) * 0.7);
    s.attention += (attentionTarget - s.attention) * (1 - Math.exp(-dt / 0.65));
    if (s.attention > 0.35 && !this.noticed) { s.thoughtPulse = 1; this.noticed = true; }
    if (s.attention < 0.1) this.noticed = false;
    const target = s.attention > 0.15 ? pointerAngle : this.targetAngle;
    const delta = Math.atan2(Math.sin(target - s.focusAngle), Math.cos(target - s.focusAngle));
    s.focusAngle += delta * (1 - Math.exp(-dt / 1.1));
    s.focusAngle = Math.atan2(Math.sin(s.focusAngle), Math.cos(s.focusAngle));
    const still = this.mode === 1 ? (1 - clamp(scared)) * (1 - s.attention * 0.65) : 0;
    s.contemplation += (still - s.contemplation) * (1 - Math.exp(-dt / 0.8));
    s.thoughtPulse *= Math.exp(-dt / 1.7);
    s.thoughtPhase = (s.thoughtPhase + dt * (0.09 + s.attention * 0.13 + s.thoughtPulse * 0.15) * (1 - s.contemplation * 0.7)) % 1;
    s.structureTime += dt * (1 - s.contemplation * 0.9) * (1 - clamp(sleepiness) * 0.6);
  }
}
