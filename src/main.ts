import { createApp } from 'vue';
import App from './App.vue';
import SettingsPanel from './ui/SettingsPanel.vue';
import WelcomePanel from './ui/WelcomePanel.vue';

// 运行期错误收集：供诊断条与自动化验证读取（上限 50 条，避免长期运行堆积）。
const emerge = window as typeof window & { __emergeErrors?: string[] };
emerge.__emergeErrors = [];
const pushError = (msg: string) => {
  const list = emerge.__emergeErrors!;
  list.push(msg);
  if (list.length > 50) list.splice(0, list.length - 50);
};
window.addEventListener('error', (e) => pushError(String(e.message)));
window.addEventListener('unhandledrejection', (e) => pushError(String(e.reason)));

/** 设置窗口：label=settings 或 ?window=settings。 */
function isSettingsWindow(): boolean {
  const q = new URLSearchParams(window.location.search).get('window');
  if (q === 'settings') return true;
  const tauriWin = (window as typeof window & {
    __TAURI__?: { window?: { getCurrent?: () => { label?: string } } };
  }).__TAURI__?.window;
  return tauriWin?.getCurrent?.()?.label === 'settings';
}

if (import.meta.env.DEV && import.meta.env.VITE_EMERGE_DIAGNOSTIC === '1') {
  // 在组件挂载之前截断：包括欢迎页中的独立粒子演示。
  const message = document.createElement('p');
  message.textContent = 'Emerge 隔离启动：粒子与音频初始化已暂停。系统重启原因正在排查；此页面不代表故障已修复。关闭请使用托盘退出或终端 Ctrl+C。';
  message.style.cssText = 'padding:32px;max-width:640px;color:#eee;background:#202020;font:16px/1.8 system-ui';
  document.querySelector('#app')?.replaceChildren(message);
} else if (new URLSearchParams(window.location.search).get('window') === 'welcome') {
  document.documentElement.classList.add('settings-window');
  createApp(WelcomePanel).mount('#app');
} else if (isSettingsWindow()) {
  // 设置窗：解除主 App 的 overflow:hidden，允许滚动。
  document.documentElement.classList.add('settings-window');
  createApp(SettingsPanel).mount('#app');
} else {
  createApp(App).mount('#app');
}
