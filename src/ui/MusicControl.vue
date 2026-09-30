<script setup lang="ts">
/**
 * 音乐/系统声音驱动（无界面，控件在托盘）。
 * Bass → 身体脉冲；Beat → 核心能量波；高频 → 外围活跃；高能 → 兴奋。
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { isDesktop, invoke, listenNative } from '../platform/desktop';
import { AudioSystem } from '../input/AudioSystem';

const emit = defineEmits<{ features: [payload: unknown] }>();

const audio = new AudioSystem();
(window as typeof window & { __emergeAudio?: AudioSystem }).__emergeAudio = audio;

let raf = 0;
let polling = false;
let systemActive = false;
let systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
let bassAverage = 0;
let lastBeat = 0;
let lastPoll = 0;
let lastSystemReading = 0;
let lastPlayRetry = 0;
let lastNowPlayingPoll = 0;
let lastNowPlayingName = '';
let unlistens: Array<() => void> = [];

function convertFileSrc(path: string): string {
  const core = (window as typeof window & {
    __TAURI__?: { core?: { convertFileSrc?: (p: string) => string } };
  }).__TAURI__?.core;
  return core?.convertFileSrc ? core.convertFileSrc(path) : `asset://localhost/${path}`;
}

/** 托盘选中的本地文件：读字节转 Blob 播放，绕开 WebView 资源协议差异。 */
function fileNameOf(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

function setTrayMusic(name: string): void {
  void invoke('update_music_info', { text: name }).catch(() => {});
}

async function loadMusicPath(path: string): Promise<void> {
  const name = fileNameOf(path);
  try {
    const raw = await invoke<ArrayBuffer | Uint8Array | number[]>('read_music_file', { path });
    let data: Uint8Array;
    if (raw instanceof Uint8Array) data = raw;
    else if (raw instanceof ArrayBuffer) data = new Uint8Array(raw);
    else if (Array.isArray(raw)) data = Uint8Array.from(raw);
    else throw new Error('unexpected audio payload');
    const blob = new Blob([data], { type: 'audio/mpeg' });
    await audio.attachUrl(URL.createObjectURL(blob), true);
    setTrayMusic(name);
  } catch (e) {
    console.warn('[music] read failed, fallback to asset url', e);
    await audio.attachUrl(convertFileSrc(path));
    setTrayMusic(name);
  }
}

async function pollSystem(): Promise<void> {
  if (!isDesktop || polling) return;
  polling = true;
  try {
    const f = await invoke<{ bass: number; mid: number; treble: number; status: number }>(
      'system_audio_read',
    );
    if (f.status === 1) {
      systemActive = true;
      lastSystemReading = performance.now();
      const now = performance.now();
      // 节拍检测放宽阈值，鼓点更好触发。
      const beat =
        (f.bass > bassAverage * 1.18 && f.bass > 0.06 && now - lastBeat > 160);
      if (beat) lastBeat = now;
      bassAverage += (f.bass - bassAverage) * (beat ? 0.2 : 0.08);
      // 对小信号提一点，弱音量也有可见反应；整体能量封顶 1。
      const boost = (v: number) => Math.min(1, v * 1.35);
      const energy = Math.min(1, (f.bass * 0.4 + f.mid * 0.4 + f.treble * 0.2) * 1.35);
      systemFeatures = {
        ...f,
        bass: boost(f.bass),
        mid: boost(f.mid),
        treble: boost(f.treble),
        active: f.status === 1,
        energy,
        beat: beat && energy > 0.05,
      };
    } else {
      bassAverage = 0;
      lastBeat = 0;
      systemActive = false;
      systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
    }
  } catch {
    // 权限失败等：停止本帧系统特征，托盘再点可重试。
    systemActive = false;
    systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
  } finally {
    polling = false;
  }
}

onMounted(() => {
  if (isDesktop) {
    void listenNative<string>('music-file', (path) => {
      if (!path) {
        audio.detach();
        setTrayMusic('');
        return;
      }
      void loadMusicPath(path).catch((e) => {
        console.warn('[music]', e);
        setTrayMusic('');
      });
    }).then((un) => unlistens.push(un));
    void listenNative<string>('audio-error', (e) => {
      console.warn('[system-audio]', e);
    }).then((un) => unlistens.push(un));
  }

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    if (isDesktop && now - lastPoll > 100) {
      lastPoll = now;
      void pollSystem();
    }
    // 系统监听：轮询「正在播放」曲名，写入托盘（文件音乐不占用此通道）。
    if (systemActive && now - lastNowPlayingPoll > 3000) {
      lastNowPlayingPoll = now;
      void invoke<string>('system_now_playing')
        .then((name) => {
          const text = (name || '').trim();
          if (text !== lastNowPlayingName) {
            lastNowPlayingName = text;
            setTrayMusic(text);
          }
        })
        .catch(() => {});
    }
    if (!systemActive) lastNowPlayingName = '';
    // 待播补播：托盘选歌后一旦有手势机会就出声，不依赖单次点击。
    if (now - lastPlayRetry > 800) {
      lastPlayRetry = now;
      audio.retryPendingPlay();
    }
    if (systemActive && now - lastSystemReading > 1000) {
      systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
    }
    // 复用同一特征对象，避免每帧分配触发 GC 抖动；beat 由主循环消费后清零。
    const f = systemActive ? systemFeatures : audio.read(now);
    emit('features', f);
  };
  raf = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  for (const un of unlistens) un();
  unlistens = [];
  audio.detach();
});
</script>

<template>
  <!-- 控件已移入托盘；此处仅保留音频特征通道。 -->
</template>
