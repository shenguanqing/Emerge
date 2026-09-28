import { createApp } from 'vue';
import App from './App.vue';

// 运行期错误收集：供诊断条与自动化验证读取。
const emerge = window as typeof window & { __emergeErrors?: string[] };
emerge.__emergeErrors = [];
window.addEventListener('error', (e) => emerge.__emergeErrors!.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) =>
  emerge.__emergeErrors!.push(String(e.reason)),
);

createApp(App).mount('#app');
