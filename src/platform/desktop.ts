import { t } from '../i18n';

export const isDesktop = '__TAURI_INTERNALS__' in window;

type TauriGlobal = {
  __TAURI__?: {
    core: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
      convertFileSrc?: (p: string) => string;
    };
    event?: {
      emit?(event: string, payload: unknown): Promise<void>;
      listen<T>(
        event: string,
        handler: (event: { payload: T }) => void,
      ): Promise<() => void>;
    };
  };
};

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = (window as typeof window & TauriGlobal).__TAURI__;
  if (!api) return Promise.reject(new Error(t('error.desktopUnavailable')));
  return api.core.invoke<T>(command, args);
}

/** 监听原生事件；返回取消函数。非桌面或 API 不可用时为空操作。 */
export function listenNative<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const api = (window as typeof window & TauriGlobal).__TAURI__;
  if (!api?.event?.listen) return Promise.resolve(() => {});
  return api.event.listen<T>(event, (e) => handler(e.payload)).then(
    (un) => un,
    () => () => {},
  );
}

/** 独立 WebView 间传递设置；Web 预览不发送原生事件。 */
export function emitNative(event: string, payload: unknown): Promise<void> {
  return (window as typeof window & TauriGlobal).__TAURI__?.event?.emit?.(event, payload) ?? Promise.resolve();
}

/**
 * 同页事件桥：主应用内嵌的设置/引导覆盖层与主循环通信用。
 * 桌面端面板在独立 WebView 中，跨窗走原生事件；Web 端同页走 DOM 事件。
 * 桌面端发本地事件无副作用（主窗无同名监听，跨窗收不到 DOM 事件）。
 */
export function emitLocal(event: string, payload: unknown): void {
  window.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

export function listenLocal<T>(event: string, handler: (payload: T) => void): () => void {
  const listener = (e: Event): void => handler((e as CustomEvent<T>).detail);
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}
