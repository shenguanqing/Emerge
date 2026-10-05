/**
 * 生命标签页互斥锁：同一浏览器的多个标签页同时运行会互相覆盖生命存档。
 * localStorage 锁 + 心跳仲裁——首个标签页成为「陪伴者」运行生命体并写档，
 * 其余标签页暂停模拟并提示；持有者关闭/崩溃后锁过期，等待中的标签页自动接管。
 * 存储与时钟可注入（测试用 MemoryStorage），Web 绑定见 acquireLifeTabLock。
 */

export interface LockHost {
  read(): string | null;
  write(raw: string): void;
  clear(): void;
  /** 订阅其它标签页对该键的写入（newValue 为 null 表示清除）。 */
  onChange(handler: (newValue: string | null) => void): () => void;
  now(): number;
}

export interface LifeTabLockCallbacks {
  onAcquired?: () => void;
  onLost?: () => void;
}

interface LockPayload {
  id: string;
  t: number;
}

export const TAB_LOCK_KEY = 'emerge.life.lock';
export const TAB_LOCK_STALE_MS = 5000;
export const TAB_LOCK_HEARTBEAT_MS = 2000;

export class LifeTabLock {
  readonly id: string;
  private leader = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private host: LockHost,
    private callbacks: LifeTabLockCallbacks = {},
    private staleMs = TAB_LOCK_STALE_MS,
    private heartbeatMs = TAB_LOCK_HEARTBEAT_MS,
  ) {
    this.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // 其它标签页的锁写入（含清除）驱动让位与接管。
    this.host.onChange((raw) => this.notifyExternal(raw));
  }

  get isLeader(): boolean {
    return this.leader;
  }

  /** 开始竞锁并启用心跳；返回当前是否持有。 */
  start(): boolean {
    this.acquire();
    this.timer = setInterval(() => this.tick(), this.heartbeatMs);
    // Node 测试环境不因心跳定时器挂住进程；浏览器 Interval 无 unref，安全跳过。
    (this.timer as { unref?: () => void }).unref?.();
    return this.leader;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.release();
  }

  /** 尝试成为持有者：锁不存在或已过期即可获取；并发以最后一次写入仲裁。 */
  acquire(): boolean {
    if (this.stopped) return this.leader;
    const raw = this.host.read();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LockPayload;
        const fresh = this.host.now() - parsed.t <= this.staleMs;
        if (parsed.id !== this.id && fresh) {
          this.setLeader(false);
          return false;
        }
      } catch {
        /* 损坏锁视为无主 */
      }
    }
    this.host.write(JSON.stringify({ id: this.id, t: this.host.now() } satisfies LockPayload));
    // 重读仲裁并发：只认最后一次写入者。
    this.setLeader(this.readOwner() === this.id);
    return this.leader;
  }

  /** 心跳：持有者续期；未持有者重试获取（过期锁接管）。 */
  tick(): void {
    if (this.stopped) return;
    if (this.leader) {
      this.host.write(JSON.stringify({ id: this.id, t: this.host.now() } satisfies LockPayload));
      return;
    }
    this.acquire();
  }

  /** 释放锁（仅当仍归我所有），并退回等待者。 */
  release(): void {
    if (this.leader) {
      try {
        const raw = this.host.read();
        const parsed = raw ? (JSON.parse(raw) as LockPayload) : null;
        if (!parsed || parsed.id === this.id) this.host.clear();
      } catch {
        this.host.clear();
      }
    }
    this.setLeader(false);
  }

  /** 其它标签页写入了新锁：让位。 */
  notifyExternal(raw: string | null): void {
    if (this.stopped) return;
    if (raw === null) {
      // 锁被清除（持有者关闭）：等待者立即竞锁。
      if (!this.leader) this.acquire();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as LockPayload;
      if (parsed.id !== this.id) this.setLeader(false);
    } catch {
      /* 损坏载荷忽略 */
    }
  }

  private readOwner(): string | null {
    try {
      const raw = this.host.read();
      return raw ? (JSON.parse(raw) as LockPayload).id ?? null : null;
    } catch {
      return null;
    }
  }

  private setLeader(value: boolean): void {
    if (this.leader === value) return;
    this.leader = value;
    if (value) this.callbacks.onAcquired?.();
    else this.callbacks.onLost?.();
  }
}

/** Web 绑定：localStorage + storage 事件 + 真实时钟。 */
export function acquireLifeTabLock(callbacks: LifeTabLockCallbacks = {}): LifeTabLock {
  const host: LockHost = {
    read: () => {
      try { return localStorage.getItem(TAB_LOCK_KEY); } catch { return null; }
    },
    write: (raw) => {
      try { localStorage.setItem(TAB_LOCK_KEY, raw); } catch { /* ignore */ }
    },
    clear: () => {
      try { localStorage.removeItem(TAB_LOCK_KEY); } catch { /* ignore */ }
    },
    onChange: (handler) => {
      const listener = (e: StorageEvent) => {
        if (e.key === TAB_LOCK_KEY) handler(e.newValue);
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
    now: () => Date.now(),
  };
  const lock = new LifeTabLock(host, callbacks);
  lock.start();
  return lock;
}
