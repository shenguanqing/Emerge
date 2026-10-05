import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../core/LifeStorage';
import { LifeTabLock, TAB_LOCK_KEY, TAB_LOCK_STALE_MS } from './lifeTabLock';

/** 可控时钟的存储宿主：外部写入通过调用 returned.external 模拟 storage 事件。 */
function hostFrom(now: { value: number }) {
  const memory = new MemoryStorage();
  const listeners: Array<(raw: string | null) => void> = [];
  const host = {
    read: () => memory.getItem(TAB_LOCK_KEY),
    write: (raw: string) => {
      memory.setItem(TAB_LOCK_KEY, raw);
      for (const fn of listeners) fn(raw);
    },
    clear: () => {
      memory.removeItem(TAB_LOCK_KEY);
      for (const fn of listeners) fn(null);
    },
    onChange: (handler: (raw: string | null) => void) => {
      listeners.push(handler);
      return () => {};
    },
    now: () => now.value,
  };
  return { host, external: (raw: string | null) => { for (const fn of listeners) fn(raw); } };
}

test('首个标签页竞得锁；并发的第二个标签页等待', () => {
  const now = { value: 1000 };
  const { host } = hostFrom(now);
  const a = new LifeTabLock(host);
  assert.equal(a.start(), true, '无锁时立即成为持有者');
  const b = new LifeTabLock(host);
  assert.equal(b.start(), false, '新锁新鲜时第二个标签页等待');
  assert.equal(b.isLeader, false);
  a.stop();
  b.stop();
});

test('持有者心跳续期；关闭后锁过期，等待者接管', () => {
  const now = { value: 1000 };
  const { host, external } = hostFrom(now);
  const a = new LifeTabLock(host);
  a.start();
  now.value = 2500;
  a.tick();
  // 越过过期阈值之前，等待者无法接管
  now.value = 1000 + TAB_LOCK_STALE_MS - 500;
  const b = new LifeTabLock(host);
  assert.equal(b.start(), false, '心跳新鲜时锁不可抢占');
  // 持有者关闭：释放锁 → 等待者通过外部变更通知立即接管
  a.stop();
  external(null);
  assert.equal(b.isLeader, true, '锁释放后等待者接管');
  b.stop();
});

test('持有者崩溃（心跳过期）后锁可被接管，原持有者让位', () => {
  const now = { value: 1000 };
  const { host, external } = hostFrom(now);
  const a = new LifeTabLock(host);
  a.start();
  now.value = 1000 + TAB_LOCK_STALE_MS + 1;
  const b = new LifeTabLock(host);
  assert.equal(b.start(), true, '过期锁可接管');
  // 崩溃的原持有者恢复心跳时发现锁已易主，让位
  external(JSON.stringify({ id: b.id, t: now.value }));
  assert.equal(a.isLeader, false);
  a.stop();
  b.stop();
});

test('release 只清除仍归自己的锁', () => {
  const now = { value: 1000 };
  const { host } = hostFrom(now);
  const a = new LifeTabLock(host);
  a.start();
  a.stop();
  assert.equal(host.read(), null, '持有者释放后清锁');
  // 未持有者 stop 不应清掉他人的锁
  const b = new LifeTabLock(host);
  b.start();
  const c = new LifeTabLock(host);
  c.stop();
  assert.ok(host.read(), '未持有者的释放不清锁');
  b.stop();
});
