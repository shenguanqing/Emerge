import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// CLI 的 --ci 不会设置 bundler 检查的 CI 环境变量。
// 显式跳过 Finder 装饰脚本，保留应用包、图标与 Applications 链接。
const child = spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'),
  'build', '--bundles', 'app,dmg', '--ci', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CI: 'true', TAURI_BUNDLER_DMG_IGNORE_CI: 'false' },
});
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
