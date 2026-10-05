import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 默认加载当前源码的粒子界面；隔离仅作为显式排障选项。
const render = !process.argv.includes('--diagnostic');
console.log(render
  ? 'Emerge：加载当前源码的粒子界面。'
  : 'Emerge：隔离启动，暂停粒子与音频初始化；Cargo 编译并发限制为 1。');
const child = spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'dev',
  ...process.argv.slice(2).filter((arg) => !['--render', '--diagnostic'].includes(arg))], {
  stdio: 'inherit',
  env: { ...process.env, CARGO_BUILD_JOBS: '1', VITE_EMERGE_DIAGNOSTIC: render ? '0' : '1' },
});
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
