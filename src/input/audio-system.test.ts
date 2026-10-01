import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem } from './AudioSystem';

function audioHarness(blockPlayback: boolean) {
  let plays = 0;
  class FakeAudio {
    paused = true;
    src = '';
    loop = false;
    preload = '';
    addEventListener() {}
    pause() { this.paused = true; }
    async play() {
      plays++;
      if (blockPlayback) throw new Error('autoplay blocked');
      this.paused = false;
    }
  }
  class FakeContext {
    state = 'running';
    sampleRate = 48000;
    destination = {};
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createMediaElementSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() {
      return { fftSize: 2048, smoothingTimeConstant: 0.6, frequencyBinCount: 1024,
        connect() {}, disconnect() {}, getByteFrequencyData(data: Uint8Array) { data.fill(0); } };
    }
  }
  const audioDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const contextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true });
  Object.defineProperty(globalThis, 'AudioContext', { value: FakeContext, configurable: true });
  return {
    plays: () => plays,
    restore() {
      for (const [key, descriptor] of [['Audio', audioDescriptor], ['AudioContext', contextDescriptor]] as const) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('暂停待播音乐后，自动补播不得重新启动；恢复播放仍可重试', async (t) => {
  const harness = audioHarness(true);
  const audio = new AudioSystem();
  t.after(() => { audio.dispose(); harness.restore(); });
  await audio.attachUrl('test.wav');
  assert.equal(harness.plays(), 1);
  audio.setPlaying(false);
  audio.retryPendingPlay();
  await Promise.resolve();
  assert.equal(harness.plays(), 1);
  assert.equal(audio.read(1000).active, false);
  audio.setPlaying(true);
  await Promise.resolve();
  assert.equal(harness.plays(), 2);
});

test('文件播放、暂停、恢复和停止正确切断音乐特征', async (t) => {
  const harness = audioHarness(false);
  const audio = new AudioSystem();
  t.after(() => { audio.dispose(); harness.restore(); });
  await audio.attachUrl('test.wav');
  assert.equal(audio.isPlaying(), true);
  assert.equal(audio.read(1000).active, true);
  audio.setPlaying(false);
  assert.equal(audio.read(1100).active, false);
  audio.setPlaying(true);
  await Promise.resolve();
  assert.equal(audio.isPlaying(), true);
  audio.detach();
  assert.equal(audio.active, false);
  assert.equal(audio.read(1200).energy, 0);
});
