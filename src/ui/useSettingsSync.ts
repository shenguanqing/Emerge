import { onBeforeUnmount, onMounted } from 'vue';
import { DEFAULT_SETTINGS, diffSettings, loadSettings, SETTINGS_STORAGE_KEY, type AppSettings } from '../core/settings';
import { listenNative } from '../platform/desktop';

/** 原生事件覆盖独立 WebView，storage 事件覆盖同源浏览器窗口；接收端只合并变更字段。 */
export function useSettingsSync(apply: (patch: Partial<AppSettings>) => void, enabled = true): void {
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const receive = (patch: Partial<AppSettings>) => { if (!disposed) apply(patch); };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_STORAGE_KEY || !event.newValue) return;
    try {
      const previous = event.oldValue ? JSON.parse(event.oldValue) as AppSettings : DEFAULT_SETTINGS;
      receive(diffSettings(previous, loadSettings()));
    } catch { /* 损坏的外部存储事件不改当前编辑状态 */ }
  };
  onMounted(() => {
    if (!enabled) return;
    window.addEventListener('storage', onStorage);
    void listenNative<Partial<AppSettings>>('app-settings-changed', receive).then((remove) => {
      if (disposed) remove(); else unlisten = remove;
    });
  });
  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener('storage', onStorage);
    unlisten?.();
  });
}
