import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseVersion = value => {
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(value)) throw new Error('Catalog versions must have four numeric components');
    const parts = value.split('.').map(Number);
    if (parts.some(part => !Number.isSafeInteger(part) || part > 2147483647)) throw new Error('Catalog version components are out of range');
    return parts;
};
const compare = (left, right) => {
    const a = parseVersion(left), b = parseVersion(right);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
};

export function validateCatalogHistory(history, currentVersion) {
    parseVersion(currentVersion);
    if (!Array.isArray(history) || !history.length) throw new Error('Catalog history must retain earlier releases');
    let previous = currentVersion;
    for (const entry of history) {
        if (!entry || compare(previous, entry.version) <= 0) throw new Error('Catalog history must be unique, older than this release and newest first');
        parseVersion(entry.targetAbi);
        const url = new URL(entry.sourceUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
            || !/^[0-9A-F]{32}$/.test(entry.checksum) || !entry.changelog?.trim()
            || !/(?:Z|[+-]\d\d:\d\d)$/.test(entry.timestamp) || !Number.isFinite(Date.parse(entry.timestamp))) {
            throw new Error(`Invalid historical catalog entry: ${entry.version}`);
        }
        previous = entry.version;
    }
    return history;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const history = JSON.parse(await readFile(path.join(root, 'web/catalog-history.json'), 'utf8'));
        const version = (await readFile(path.join(root, 'Directory.Build.props'), 'utf8')).match(/<Version>([^<]+)<\/Version>/)?.[1];
        validateCatalogHistory(history, version);
        console.log(`Validated ${history.length} historical catalog releases`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
