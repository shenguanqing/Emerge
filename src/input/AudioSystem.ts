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
  private source: MediaElementAudioSourceNode | null = null;
  private readonly unlock = () => { void this.resumeAndPlay(); };
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private lastBeatAt = 0;
  private bassAvg = 0;
  /** 复用输出对象，避免每帧分配。 */
  private readonly out: MusicFeatures = {
    active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false,
  };
  /** 托盘事件无用户手势时 play() 会被拦，等首次手势后补播。 */
  private pendingPlay = false;
  private unlockInstalled = false;
  active = false;

  constructor() {
    // 首次任意手势解锁 AudioContext / 补播（托盘选文件不在网页手势内）。
    if (typeof window !== 'undefined' && !this.unlockInstalled) {
      this.unlockInstalled = true;
      window.addEventListener('pointerdown', this.unlock, { capture: true, once: false });
      window.addEventListener('keydown', this.unlock, { capture: true, once: false });
    }
  }

  /** 用户选择音乐文件后接入（须在用户手势中调用）。 */
  async attachFile(file: File): Promise<void> {
    await this.attachUrl(URL.createObjectURL(file), true);
  }

  /** 以 URL / asset 路径接入（托盘选文件等场景）。 */
  async attachUrl(url: string, revokeAfter = false): Promise<void> {
    this.detach();
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* 等手势解锁 */ }
    }

    this.audioEl = new Audio();
    this.objectUrl = revokeAfter ? url : null;
    this.audioEl.src = url;
    this.audioEl.loop = true;
    this.audioEl.preload = 'auto';
    const element = this.audioEl;
    this.audioEl.addEventListener('error', () => {
      if (this.audioEl !== element) return;
      const code = element.error?.code;
      console.warn('[audio] element error', code, url.slice(0, 80));
    });

    const source = this.ctx.createMediaElementSource(this.audioEl);
    this.source = source;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination); // 音乐照常出声
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.active = true;
    this.pendingPlay = true;
    await this.resumeAndPlay();
  }

  /** 手势内调用可直接出声；手势外只标记待播。 */
  private async resumeAndPlay(): Promise<void> {
    if (!this.audioEl || !this.pendingPlay) return;
    try {
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      if (!this.pendingPlay || !this.audioEl) return;
      await this.audioEl.play();
      this.pendingPlay = false;
    } catch {
      // 仍被自动播放策略拦下：保留 pendingPlay，下一次手势再试。
    }
  }

  /** 暴露给渲染循环的补播入口。 */
  retryPendingPlay(): void {
    if (this.pendingPlay) void this.resumeAndPlay();
  }

  /** 播放/暂停。 */
  setPlaying(playing: boolean): void {
    if (!this.audioEl) return;
    if (playing) {
      this.pendingPlay = true;
      void this.resumeAndPlay();
    } else {
      this.pendingPlay = false;
      this.audioEl.pause();
    }
  }

  isPlaying(): boolean {
    return this.active && !!this.audioEl && !this.audioEl.paused;
  }

  /** 每帧读取音乐特征。未激活时返回 inactive（复用同一对象）。 */
  read(now: number): MusicFeatures {
    const out = this.out;
    if (!this.isPlaying() || !this.analyser || !this.freq) {
      out.active = false;
      out.bass = 0;
      out.mid = 0;
      out.treble = 0;
      out.energy = 0;
      out.beat = false;
      return out;
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

    // 节拍检测：低频能量突增（阈值 + 250ms 冷却）。
    let beat = false;
    if (bass > this.bassAvg * 1.35 && bass > 0.3 && now - this.lastBeatAt > 250) {
      beat = true;
      this.lastBeatAt = now;
    }
    this.bassAvg += (bass - this.bassAvg) * 0.05;

    out.active = true;
    out.bass = bass;
    out.mid = mid;
    out.treble = treble;
    out.energy = bass * 0.4 + mid * 0.4 + treble * 0.2;
    out.beat = beat;
    return out;
  }

  detach(): void {
    this.active = false;
    this.pendingPlay = false;
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
      this.audioEl = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.bassAvg = 0;
    this.lastBeatAt = 0;
    this.analyser = null;
    this.freq = null;
  }
  dispose(): void {
    this.detach();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.unlock, true);
      window.removeEventListener('keydown', this.unlock, true);
    }
    const context = this.ctx;
    this.ctx = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

}
