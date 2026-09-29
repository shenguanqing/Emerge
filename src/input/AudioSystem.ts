/**
 * 音频系统：把音乐特征提取为行为参数（不是可视化器）。
 * 分析 Bass / Mid / Treble / Energy / Beat，生命体"听音乐"：
 * Bass → 身体脉冲；Beat → 核心能量波；Treble → 外围活跃。
 * 归属 input 层：使用 Web Audio API（浏览器平台能力）。
 */

export interface MusicFeatures {
  /** 是否有音频在播放。 */
  active: boolean;
  /** 低频能量 0..1（约 20–150Hz）。 */
  bass: number;
  /** 中频能量 0..1（约 150–2000Hz）。 */
  mid: number;
  /** 高频能量 0..1（约 2k–9kHz）。 */
  treble: number;
  /** 综合能量 0..1。 */
  energy: number;
  /** 本帧是否检测到节拍。 */
  beat: boolean;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private lastBeatAt = 0;
  private bassAvg = 0;
  active = false;

  /** 用户选择音乐文件后接入（须在用户手势中调用）。 */
  async attachFile(file: File): Promise<void> {
    this.detach();
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.audioEl = new Audio();
    this.objectUrl = URL.createObjectURL(file);
    this.audioEl.src = this.objectUrl;
    this.audioEl.loop = true;

    const source = this.ctx.createMediaElementSource(this.audioEl);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination); // 音乐照常出声
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    await this.audioEl.play();
    this.active = true;
  }

  /** 播放/暂停。 */
  setPlaying(playing: boolean): void {
    if (!this.audioEl) return;
    if (playing) void this.audioEl.play();
    else this.audioEl.pause();
  }

  isPlaying(): boolean {
    return this.active && !!this.audioEl && !this.audioEl.paused;
  }

  /** 每帧读取音乐特征。未激活时返回 inactive。 */
  read(now: number): MusicFeatures {
    if (!this.active || !this.analyser || !this.freq) {
      return { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
    }
    this.analyser.getByteFrequencyData(this.freq);
    const binHz = (this.ctx?.sampleRate ?? 48000) / (this.analyser.fftSize * 2) * 2;
    const avg = (fromHz: number, toHz: number): number => {
      const a = Math.max(1, Math.floor(fromHz / binHz));
      const b = Math.min(this.freq!.length - 1, Math.ceil(toHz / binHz));
      let sum = 0;
      for (let i = a; i <= b; i += 1) sum += this.freq![i];
      return sum / ((b - a + 1) * 255);
    };
    const bass = avg(20, 150);
    const mid = avg(150, 2000);
    const treble = avg(2000, 9000);
    const energy = bass * 0.4 + mid * 0.4 + treble * 0.2;

    // 节拍检测：低频能量突增（阈值 + 250ms 冷却）。
    let beat = false;
    if (bass > this.bassAvg * 1.35 && bass > 0.3 && now - this.lastBeatAt > 250) {
      beat = true;
      this.lastBeatAt = now;
    }
    this.bassAvg += (bass - this.bassAvg) * 0.05;

    return { active: true, bass, mid, treble, energy, beat };
  }

  detach(): void {
    this.active = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
      this.audioEl = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.analyser = null;
    this.freq = null;
  }
}
