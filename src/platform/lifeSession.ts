import { MemoryStorage, STORAGE_KEY, type StorageLike } from '../core/LifeStorage';

/** 开发预览只使用真实存档的副本；重置预览不能删除持久化生命。 */
export function createLifeSession(search: string, persisted: StorageLike) {
  const params = new URLSearchParams(search);
  const debug = params.get('debug') === '1';
  const preview = debug || ['growth', 'age', 'offline', 'timelapse'].some((key) => params.has(key));
  if (!preview) return { debug, preview, storage: persisted };
  const storage = new MemoryStorage();
  if (params.get('freshLife') !== '1') {
    const snapshot = persisted.getItem(STORAGE_KEY);
    if (snapshot) storage.setItem(STORAGE_KEY, snapshot);
  }
  return { debug, preview, storage };
}

/** 保留后端/调试/离线参数，在预览会话中以新生命重新载入。 */
export function freshPreviewUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.set('freshLife', '1');
  return url.toString();
}
