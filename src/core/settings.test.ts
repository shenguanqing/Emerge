import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, diffSettings, loadSettings, mergeSettingsDraft, patchSettings, saveSettings, SETTINGS_STORAGE_KEY } from './settings';

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
