import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { categoryPageSize, normalizeCategories } from '../patches/jellyfin-web-12.2/src/apps/legacy/controllers/livetv/livetvcategoriesModel.js';
import { categoryIcon, createIcon } from '../patches/jellyfin-web-12.2/src/apps/legacy/controllers/livetv/livetvcategoriesIcons.js';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlayRoot = path.join(webRoot, 'patches/jellyfin-web-12.2');
const readOwned = relative => readFile(path.join(overlayRoot, 'src/apps/legacy/controllers/livetv', relative), 'utf8');

test('legacy category controller retains context, cancellation and destruction handling', async () => {
    const [controller, patch] = await Promise.all([
        readOwned('livetvcategories.js'), readFile(path.join(overlayRoot, 'integration.patch'), 'utf8')
    ]);
    assert.match(controller, /this\.onShow = function/);
    assert.match(controller, /showSelectedCategory\(\);\s*restoreCategoryFocus\(\);/);
    assert.match(controller, /event\.detail\.command === 'back' && selectedCategory/);
    assert.match(controller, /requestId === categoryRequestId/);
    assert.match(controller, /categoryLoadState !== 'loading'/);
    assert.match(controller, /removeEventListener/);
    assert.match(patch, /\+.*index === 0 \|\| index === 1/);
    assert.doesNotMatch(patch, /livetv\.html/);
});

test('owned SVG icons do not depend on upstream fonts, glyph names or ligatures', async () => {
    const [controller, template, adapter] = await Promise.all([
        readOwned('livetvcategories.js'), readOwned('livetvcategories.template.html'), readOwned('livetvcategoriesAdapter.js')
    ]);
    assert.doesNotMatch(controller + template, /material-icons|sports_soccer|chevron_right|arrow_back/);
    assert.match(controller, /createIcon\(context\.ownerDocument, direction\.toLowerCase\(\)\)/);
    assert.match(adapter, /cardBuilder\.getCardsHtml/);
    assert.match(adapter, /showCurrentProgram: true/);
    assert.match(adapter, /mainTabsManager\.selectedTabIndex\(2\)/);
    assert.doesNotMatch(controller + adapter, /ChannelInfo\.Path|MediaSources|Dispatcharr|Xtream/i);
});

test('legacy dynamic imports cannot accidentally include test-only dependencies', async () => {
    const files = await readdir(path.join(overlayRoot, 'src/apps/legacy/controllers/livetv'));
    assert.equal(files.some(file => /\.test\./.test(file)), false);
});

test('legacy category model validates data, deduplicates naturally and clamps page sizes', () => {
    assert.deepEqual(normalizeCategories({ Items: [
        { id: '10', name: 'News 10', channelCount: 2 },
        { id: '2', name: 'News 2', channelCount: 3 },
        { id: '2', name: 'Duplicate', channelCount: 100 },
        { id: '', name: 'Invalid', channelCount: 1 },
        { id: 'bad', name: 'Bad', channelCount: -1 }
    ] }).map(item => item.id), ['2', '10']);
    assert.throws(() => normalizeCategories({ error: true }), TypeError);
    assert.equal(categoryPageSize(0), 100);
    assert.equal(categoryPageSize(Number.NaN), 100);
    assert.equal(categoryPageSize(0.5), 100);
    assert.equal(categoryPageSize(50.9), 50);
    assert.equal(categoryPageSize(500), 250);
});

test('legacy SVG creation uses safe attributes and has a dependable fallback', () => {
    const documentRef = {
        createElementNS(namespace, tag) {
            return { namespace, tag, attrs: {}, children: [],
                setAttribute(name, value) { this.attrs[name] = value; },
                appendChild(child) { this.children.push(child); }
            };
        }
    };
    const icon = createIcon(documentRef, 'unknown');
    assert.equal(icon.namespace, 'http://www.w3.org/2000/svg');
    assert.equal(icon.attrs['aria-hidden'], 'true');
    assert.equal(icon.attrs.focusable, 'false');
    assert.equal(icon.children[0].tag, 'path');
    assert.ok(icon.children[0].attrs.d);
    assert.equal(categoryIcon({ id: 'all-channels', name: 'Everything' }), 'all');
    assert.equal(categoryIcon({ id: 'sport', name: 'Sports' }), 'sport');
    assert.equal(categoryIcon({ id: 'other', name: 'Other' }), 'tv');
});
