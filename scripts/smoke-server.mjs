import { spawnSync } from 'node:child_process';

const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/smoke-server.ps1', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
