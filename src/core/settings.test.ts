import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, diffSettings, loadSettings, mergeSettingsDraft, patchSettings, saveSettings, SETTINGS_STORAGE_KEY } from './settings';
import { bodyHitRadius } from './types';

function storage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } });
}

test('旧欢迎快照只修改配色/位置时，保留设置窗的新外观与行为', () => {
  storage();
  saveSettings(DEFAULT_SETTINGS);
  const welcome = loadSettings();
  patchSettings({ brightness: 0.7, pointScale: 1.4, topmost: false, clickthrough: false });
  welcome.theme = 'sage';
  patchSettings({ theme: welcome.theme });
  const after = patchSettings({ positionX: 0.2, positionY: 0.3 });
  assert.deepEqual(after, { ...DEFAULT_SETTINGS, brightness: 0.7, pointScale: 1.4,
    topmost: false, clickthrough: false, theme: 'sage', positionX: 0.2, positionY: 0.3 });
  assert.deepEqual(loadSettings(), after, '保存与广播快照一致');
});

test('设置窗待提交编辑与远程补丁同时到达，保留双方不同字段', () => {
  storage();
  const baseline = { ...DEFAULT_SETTINGS };
  const draft = { ...baseline, brightness: 0.8 };
  patchSettings({ theme: 'mist', positionX: 0.25 });
  const merged = mergeSettingsDraft(baseline, draft, { theme: 'mist', positionX: 0.25 });
  const result = patchSettings(diffSettings(merged.saved, merged.editing));
  assert.equal(result.brightness, 0.8);
  assert.equal(result.theme, 'mist');
  assert.equal(result.positionX, 0.25);
});

test('恢复默认可作为明确的整组编辑，不回放旧快照未编辑的字段', () => {
  storage();
  const customized = { ...DEFAULT_SETTINGS, brightness: 0.6, topmost: false, theme: 'mauve' };
  saveSettings(customized);
  patchSettings({ theme: 'mist', positionX: 0.25 });
  patchSettings(DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(diffSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }), {});
  assert.ok(localStorage.getItem(SETTINGS_STORAGE_KEY));
});

test('同字段事件回放不会覆盖本地待提交值，未编辑字段仍接受远程值', () => {
  const saved = { ...DEFAULT_SETTINGS };
  const merged = mergeSettingsDraft(saved, { ...saved, brightness: 0.8 }, { brightness: 1.2, theme: 'sage' });
  assert.equal(merged.saved.brightness, 1.2);
  assert.equal(merged.editing.brightness, 0.8);
  assert.equal(merged.editing.theme, 'sage');
  assert.deepEqual(diffSettings(merged.saved, merged.editing), { brightness: 0.8 });
});

test('团大小标定放大后保留存档百分比，命中范围覆盖新外缘并保留小尺寸余量', () => {
  storage();
  assert.equal(loadSettings().bodyScale, 0.8, '默认为 80%');
  for (const bodyScale of [0.1, 0.4, 1]) {
    saveSettings({ ...DEFAULT_SETTINGS, bodyScale });
    assert.equal(loadSettings().bodyScale, bodyScale, '10%–100% 存档无需迁移');
  }
  saveSettings({ ...DEFAULT_SETTINGS, bodyScale: 0.4 });
  const scale = loadSettings().bodyScale;
  const radius = bodyHitRadius(scale, 1, 0.01, 44);
  assert.ok(radius > 80 && radius < 90, '默认尺寸可命中新扩大外缘的 80px，90px 仍在团外');
  const breathingRadius = bodyHitRadius(scale, 1.08, 0.01, 44);
  assert.ok(breathingRadius > 88 && breathingRadius < 90, '呼吸外扩同时扩大命中包络');
  assert.equal(bodyHitRadius(0.1, 1, 0.01, 44), 44, '最小尺寸保留手指命中余量');
  assert.ok(bodyHitRadius(1, 1, 0.01, 44) > 200, '100% 保留最大身体包络');
  saveSettings({ ...DEFAULT_SETTINGS, bodyScale: 0 });
  assert.equal(loadSettings().bodyScale, 0.1);
  saveSettings({ ...DEFAULT_SETTINGS, bodyScale: 2 });
  assert.equal(loadSettings().bodyScale, 1);
});
