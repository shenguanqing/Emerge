<script setup lang="ts">
/**
 * 音乐/系统声音驱动，观察空间与托盘共享同一音频生命周期。
 * Bass → 身体脉冲；Beat → 核心能量波；高频 → 外围活跃；高能 → 兴奋。
 */
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { isDesktop, invoke, listenNative } from '../platform/desktop';
import { AudioSystem } from '../input/AudioSystem';
import { t } from '../i18n';

defineProps<{ controlsVisible: boolean }>();
const selectedName = ref('');
const sourceStatus = ref<'off' | 'file' | 'paused' | 'starting' | 'system'>('off');
const musicError = ref('');
const busy = ref(false);
const systemRequested = ref(false);
const systemListening = computed(() => systemRequested.value || sourceStatus.value === 'starting' || sourceStatus.value === 'system');
const fileControlsDisabled = computed(() => busy.value || systemListening.value);
let systemRevision = 0;
const fileInput = ref<HTMLInputElement | null>(null);

const emit = defineEmits<{ features: [payload: unknown] }>();

const audio = new AudioSystem();
(window as typeof window & { __emergeAudio?: AudioSystem }).__emergeAudio = audio;

let raf = 0;
let polling = false;
let disposed = false;
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
    selectedName.value = name;
    setTrayMusic(name);
  } catch (e) {
    console.warn('[music] read failed, fallback to asset url', e);
    await audio.attachUrl(convertFileSrc(path));
    selectedName.value = name;
    setTrayMusic(name);
  }
}

async function pollSystem(): Promise<void> {
  if (!isDesktop || polling || busy.value) return;
  const revision = systemRevision;
  polling = true;
  try {
    const f = await invoke<{ bass: number; mid: number; treble: number; status: number }>(
      'system_audio_read',
    );
    if (disposed || busy.value || revision !== systemRevision) return;
    systemRequested.value = f.status === 1 || f.status === 2;
    sourceStatus.value = f.status === 2 ? 'starting' : f.status === 1 ? 'system' : audio.active ? (audio.isPlaying() ? 'file' : 'paused') : 'off';
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
      if (!audio.active && selectedName.value) {
        selectedName.value = '';
        setTrayMusic('');
      }
      bassAverage = 0;
      lastBeat = 0;
      systemActive = false;
      systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
    }
  } catch (error) {
    if (disposed || busy.value || revision !== systemRevision) return;
    systemRequested.value = false;
    musicError.value = String(error);
    sourceStatus.value = audio.active ? 'file' : 'off';
    // 权限失败等：停止本帧系统特征，托盘再点可重试。
    systemActive = false;
    systemFeatures = { active: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
  } finally {
    polling = false;
  }
}

async function selectFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || fileControlsDisabled.value) { input.value = ''; return; }
  busy.value = true;
  musicError.value = '';
  try {
    if (isDesktop) await invoke('ensure_file_music_available');
    await audio.attachFile(file);
    selectedName.value = file.name;
    sourceStatus.value = audio.isPlaying() ? 'file' : 'paused';
    if (isDesktop) setTrayMusic(file.name);
  } catch (error) {
    musicError.value = String(error);
  } finally {
    busy.value = false;
    input.value = '';
  }
}

async function toggleSystem(): Promise<void> {
  busy.value = true;
  musicError.value = '';
  const enabled = !systemListening.value;
  systemRevision++;
  systemRequested.value = enabled;
  try {
    await invoke('set_system_audio_enabled', { enabled });
    if (enabled) {
      audio.detach();
      selectedName.value = '';
      sourceStatus.value = 'starting';
    } else {
      systemActive = false;
      sourceStatus.value = 'off';
      selectedName.value = '';
    }
  } catch (error) {
    systemRequested.value = false;
    musicError.value = String(error);
  } finally {
    busy.value = false;
  }
}

function togglePlayback(): void {
  if (fileControlsDisabled.value) return;
  audio.setPlaying(!audio.isPlaying());
  sourceStatus.value = audio.isPlaying() ? 'file' : 'paused';
}

async function stopMusic(): Promise<void> {
  if (fileControlsDisabled.value) return;
  systemRevision++;
  busy.value = true;
  musicError.value = '';
  try {
    if (isDesktop) await invoke('ensure_file_music_available');
    audio.detach();
    selectedName.value = '';
    sourceStatus.value = 'off';
    if (isDesktop) setTrayMusic('');
  } catch (error) {
    musicError.value = String(error);
  } finally { busy.value = false; }
}

onMounted(() => {
  if (isDesktop) {
    void listenNative<string>('music-file', (path) => {
      if (!path) {
        audio.detach();
        selectedName.value = '';
        sourceStatus.value = systemRequested.value ? 'starting' : 'off';
        setTrayMusic('');
        return;
      }
      if (systemListening.value) return;
      void loadMusicPath(path).catch((e) => {
        musicError.value = String(e);
        selectedName.value = '';
        console.warn('[music]', e);
        setTrayMusic('');
      });
    }).then((un) => { if (disposed) un(); else unlistens.push(un); });
    void listenNative<string>('audio-error', (e) => {
      systemRequested.value = false;
      musicError.value = e;
      console.warn('[system-audio]', e);
    }).then((un) => { if (disposed) un(); else unlistens.push(un); });
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
            selectedName.value = text;
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
    if (!isDesktop) sourceStatus.value = audio.active ? (audio.isPlaying() ? 'file' : 'paused') : 'off';
    const f = systemActive ? systemFeatures : audio.read(now);
    emit('features', f);
  };
  raf = requestAnimationFrame(loop);
});

onBeforeUnmount(() => {
  disposed = true;  cancelAnimationFrame(raf);
  for (const un of unlistens) un();
  unlistens = [];
  audio.dispose();
});
</script>

<template>
  <Teleport v-if="controlsVisible" defer to="#observatory-music">
    <section class="music-panel" :aria-label="t('music.title')">
      <h2>{{ t('music.title') }}</h2>
      <p class="music-status" role="status">{{ t(`music.${sourceStatus}`) }}</p>
      <p v-if="selectedName" class="music-name">{{ selectedName }}</p>
      <input ref="fileInput" class="music-file" :disabled="fileControlsDisabled" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.aiff,.aif" :aria-label="t('music.select')" @change="selectFile" />
      <p v-if="systemListening" class="music-name">{{ t('music.systemHint') }}</p>
      <div class="music-actions">
        <button v-if="isDesktop" type="button" :disabled="busy" :aria-pressed="systemListening" @click="toggleSystem">{{ t(systemListening ? 'music.stopSystem' : 'music.listen') }}</button>
        <button type="button" :disabled="fileControlsDisabled" @click="fileInput?.click()">{{ t('music.select') }}</button>
        <button v-if="!systemListening && (sourceStatus === 'file' || sourceStatus === 'paused')" type="button" :disabled="busy" @click="togglePlayback">{{ t(sourceStatus === 'file' ? 'music.pause' : 'music.play') }}</button>
        <button type="button" :disabled="fileControlsDisabled || sourceStatus === 'off'" @click="stopMusic">{{ t('music.stop') }}</button>
      </div>
      <p v-if="musicError" class="music-error" role="alert">{{ t('music.error', { e: musicError }) }}</p>
    </section>
  </Teleport>
</template>

<style scoped>
.music-panel h2 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .12em; color: rgba(242,240,234,.55); }
.music-status, .music-name { margin: 4px 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.music-name { color: rgba(242,240,234,.6); }
.music-file { display: none; }
.music-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.music-actions button { font: inherit; font-size: 12px; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f2f0ea; cursor: pointer; }
.music-actions button:hover { background: rgba(255,255,255,.12); }
.music-actions button:disabled { opacity: .45; cursor: default; }
.music-actions button:focus-visible { outline: 2px solid #e8d5a8; outline-offset: 2px; }
.music-error { font-size: 12px; color: #efa998; overflow-wrap: anywhere; }
</style>
