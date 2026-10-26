import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await checkDirectory(target);
        else if (/\.(?:mjs|js)$/.test(entry.name)) execFileSync(process.execPath, ['--check', target], { stdio: 'inherit' });
    }
}

for (const directory of ['prototype', 'scripts', 'web/src', 'web/standalone', 'web/patches', 'web/integration']) {
    await checkDirectory(directory);
}
