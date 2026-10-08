import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryStorage, STORAGE_KEY } from '../core/LifeStorage';
import { createLifeSession, freshPreviewUrl } from './lifeSession';

test('普通会话沿用持久化存储，freshLife 单独出现不能清空真实存档', () => {
  const persisted = new MemoryStorage();
  persisted.setItem(STORAGE_KEY, 'real-life');
  const session = createLifeSession('?debug=0&freshLife=1', persisted);
  assert.equal(session.preview, false);
  assert.equal(session.storage, persisted);
  assert.equal(session.storage.getItem(STORAGE_KEY), 'real-life');
});

test('debug 与现有预览参数均复制存档，写入和删除不改变真实生命', () => {
  for (const query of ['debug=1', 'growth=0.8', 'age=12', 'offline=4320', 'timelapse=100']) {
    const persisted = new MemoryStorage();
    persisted.setItem(STORAGE_KEY, 'real-life');
    const session = createLifeSession(`?${query}`, persisted);
    assert.equal(session.preview, true);
    assert.equal(session.storage.getItem(STORAGE_KEY), 'real-life');
    session.storage.setItem(STORAGE_KEY, 'accelerated-life');
    assert.equal(persisted.getItem(STORAGE_KEY), 'real-life');
    session.storage.removeItem(STORAGE_KEY);
    assert.equal(persisted.getItem(STORAGE_KEY), 'real-life');
  }
});

test('重置预览重新诞生但保留调试/后端参数与真实存档', () => {
  const persisted = new MemoryStorage();
  persisted.setItem(STORAGE_KEY, 'real-life');
  const href = freshPreviewUrl('http://localhost:1420/?debug=1&backend=webgl2&offline=4320');
  const url = new URL(href);
  assert.equal(url.searchParams.get('debug'), '1');
  assert.equal(url.searchParams.get('backend'), 'webgl2');
  assert.equal(url.searchParams.get('offline'), '4320');
  const session = createLifeSession(url.search, persisted);
  assert.equal(session.storage.getItem(STORAGE_KEY), null);
  assert.equal(persisted.getItem(STORAGE_KEY), 'real-life');
});
