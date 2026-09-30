export const isDesktop = '__TAURI_INTERNALS__' in window;

type TauriGlobal = {
  __TAURI__?: {
    core: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
      convertFileSrc?: (p: string) => string;
    };
    event?: {
      listen<T>(
        event: string,
        handler: (event: { payload: T }) => void,
      ): Promise<() => void>;
    };
  };
};

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = (window as typeof window & TauriGlobal).__TAURI__;
  if (!api) return Promise.reject(new Error('桌面接口不可用'));
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
