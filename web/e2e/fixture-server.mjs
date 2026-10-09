import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../standalone');
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const categories = [
    { id: 'category-news', name: 'News', channelCount: 205 },
    { id: 'category-unicode', name: 'Café & World <img src=x onerror=alert(1)>', channelCount: 1 }
];
const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1:18897');
    const prefix = url.pathname.startsWith('/jellyfin/') ? '/jellyfin' : '';
    const route = url.pathname.slice(prefix.length);
    const json = (status, body) => {
        response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(body));
    };
    if (route === '/health') return json(200, { ready: true });
    if (route === '/LiveTvCategories/ui') {
        response.writeHead(302, { Location: prefix + '/LiveTvCategories/ui/' });
        return response.end();
    }
    if (route.startsWith('/LiveTvCategories/ui/')) {
        const filename = route.slice('/LiveTvCategories/ui/'.length) || 'index.html';
        if (!['index.html', 'browser-core.js', 'app.js', 'app.css'].includes(filename)) return json(404, {});
        try {
            const body = await readFile(path.join(assetRoot, filename));
            response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)], 'Cache-Control': 'no-store' });
            return response.end(body);
        } catch { return json(404, {}); }
    }
    if (route === '/web/index.html') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        return response.end('<!doctype html><title>Stock Jellyfin channel details</title><h1>Channel details</h1><p>Playback is owned by Jellyfin.</p>');
    }
    if (route === '/Users/AuthenticateByName' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const credentials = JSON.parse(body);
        if (credentials.Username !== 'viewer' || credentials.Pw !== 'fixture-password') return json(401, {});
        return json(200, { AccessToken: 'fixture-user-token', User: { Id: 'fixture-user', Name: 'viewer' }, ServerId: 'fixture-server' });
    }
    if (!request.headers.authorization?.includes('Token="fixture-user-token"')) return json(401, {});
    if (route === '/Sessions/Logout') return json(204, null);
    if (route === '/LiveTvCategories/Compatibility') return json(200, { apiContractVersion: 1, features: ['categories', 'paging'] });
    if (route === '/LiveTvCategories') return json(200, categories);
    const channelRoute = route.match(/^\/LiveTvCategories\/(category-news|category-unicode)\/Channels$/);
    if (channelRoute) {
        const start = Number(url.searchParams.get('startIndex') || 0);
        const limit = Number(url.searchParams.get('limit') || 100);
        const total = channelRoute[1] === 'category-news' ? 205 : 1;
        const items = Array.from({ length: Math.min(limit, Math.max(0, total - start)) }, (_, index) => {
            const number = start + index + 1;
            return { Id: number.toString(16).padStart(32, '0'), Name: channelRoute[1] === 'category-news' ? `News channel ${number}` : '<script>alert(1)</script>', Number: String(number), Type: 'TvChannel', CurrentProgram: { Name: 'Fixture programme' } };
        });
        return json(200, { Items: items, StartIndex: start, TotalRecordCount: total });
    }
    return json(404, {});
});
server.listen(18897, '127.0.0.1');
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
