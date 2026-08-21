import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controllerPath = path.join(
    webRoot,
    'patches/jellyfin-web-10.11.11/src/controllers/livetv/livetvsuggested.js');
const htmlPath = path.join(webRoot, 'patches/jellyfin-web-10.11.11/src/controllers/livetv.html');
const stylePath = path.join(
    webRoot,
    'patches/jellyfin-web-10.11.11/src/controllers/livetv/livetvcategories.scss');

test('10.11.11 overlay is summary-first and reuses Jellyfin channel cards', async () => {
    const [controller, html, styles] = await Promise.all([
        readFile(controllerPath, 'utf8'),
        readFile(htmlPath, 'utf8'),
        readFile(stylePath, 'utf8')
    ]);

    assert.match(controller, /getUrl\('LiveTvCategories'/);
    assert.match(controller, /LiveTvCategories\/\$\{encodeURIComponent\(selectedCategory\.id\)\}\/Channels/);
    assert.match(controller, /cardBuilder\.getCardsHtml/);
    assert.match(controller, /showCurrentProgram: true/);
    assert.match(controller, /mainTabsManager\.selectedTabIndex\(2\)/);
    assert.doesNotMatch(controller, /getLiveTvChannels\(/);
    assert.doesNotMatch(controller, /ChannelInfo\.Path|MediaSources|Dispatcharr|Xtream/i);
    assert.match(html, /class="liveTvCategoryList"/);
    assert.match(html, /class="liveTvCategoryHero/);
    assert.match(html, /class="liveTvCategoryChannelItems itemsContainer/);
    assert.doesNotMatch(html, /activeProgramItems|upcomingEpisodeItems|upcomingSportsItems/);
    assert.match(controller, /import '\.\/livetvcategories\.scss'/);
    assert.match(controller, /className = 'button-flat liveTvCategoryButton'/);
    assert.match(controller, /focusContainer\(categoryListContainer\(\)\)/);
    assert.match(styles, /grid-template-columns: repeat\(auto-fill/);
    assert.match(styles, /\.liveTvCategoryButton:focus/);
    assert.match(styles, /\.liveTvCategoryButton:active/);
    assert.match(styles, /prefers-reduced-motion/);
});
