import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlayRoot = path.join(
    webRoot,
    'patches/jellyfin-web-12.0/src/apps/legacy/controllers');
const controllerPath = path.join(overlayRoot, 'livetv/livetvsuggested.js');
const htmlPath = path.join(overlayRoot, 'livetv.html');
const stylePath = path.join(overlayRoot, 'livetv/livetvcategories.scss');

function functionBody(source, name, nextName) {
    const start = source.indexOf(`    function ${name}`);
    const end = source.indexOf(`    function ${nextName}`, start + 1);
    assert.notEqual(start, -1, `${name} must exist`);
    assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
    return source.slice(start, end);
}

test('Jellyfin 12 legacy overlay keeps category context across channel details', async () => {
    const controller = await readFile(controllerPath, 'utf8');
    const showCategoryList = functionBody(controller, 'showCategoryList()', 'showSelectedCategory()');
    const loadTab = functionBody(controller, 'loadTab(page, index)', 'categoryListContainer()');

    assert.doesNotMatch(showCategoryList, /selectedCategory\s*=\s*null/);
    assert.match(loadTab, /index === 0 \|\| index === 1/);
    assert.match(controller, /self\.onShow = function/);
    assert.match(controller, /showSelectedCategory\(\);\s*restoreCategoryFocus\(\);/);
    assert.match(controller, /evt\.detail\.command === 'back'.*selectedCategory/s);
    assert.match(controller, /returnToCategoryList\(\)/);
    assert.match(controller, /requestId === categoryRequestId/);
    assert.match(controller, /selectedCategory\?\.id === category\.id/);
    assert.match(controller, /import\('components\/autoFocuser'\)/);
    assert.doesNotMatch(controller, /import\('\.\.\/\.\.\/components\/autoFocuser'\)/);
});

test('Jellyfin 12 legacy overlay uses webOS-safe icon glyph classes', async () => {
    const [controller, html, styles] = await Promise.all([
        readFile(controllerPath, 'utf8'),
        readFile(htmlPath, 'utf8'),
        readFile(stylePath, 'utf8')
    ]);

    assert.match(controller, /`material-icons \$\{categoryIcon\(category\)\} liveTvCategoryIcon`/);
    assert.match(controller, /'material-icons chevron_right liveTvCategoryChevron'/);
    assert.doesNotMatch(controller, /icon\.textContent/);
    assert.doesNotMatch(controller, /chevron\.textContent/);
    assert.match(styles, /\.liveTvCategoryIcon\s*\{[^}]*align-self: center/s);
    assert.match(styles, /\.liveTvCategoryIcon\s*\{[^}]*height: 2\.6em/s);
    assert.match(styles, /@supports \(display: grid\)/);
    assert.match(html, /class="material-icons arrow_back"/);
});

test('Jellyfin 12 legacy overlay keeps stock channel card behavior', async () => {
    const [controller, html] = await Promise.all([
        readFile(controllerPath, 'utf8'),
        readFile(htmlPath, 'utf8')
    ]);

    assert.match(controller, /cardBuilder\.getCardsHtml/);
    assert.match(controller, /showCurrentProgram: true/);
    assert.match(controller, /mainTabsManager\.selectedTabIndex\(2\)/);
    assert.match(html, /class="liveTvCategoryChannelItems itemsContainer/);
    assert.doesNotMatch(controller, /ChannelInfo\.Path|MediaSources|Dispatcharr|Xtream/i);
});
