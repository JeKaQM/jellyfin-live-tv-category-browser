import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modernRoot = path.join(
    webRoot,
    'patches/jellyfin-web-12.1/src/apps/modern/features/libraries');

const readModern = relativePath => readFile(path.join(modernRoot, relativePath), 'utf8');

test('modern Programmes tab renders the category view without changing sibling tabs', async () => {
    const pageTabs = await readModern('components/PageTabContent.tsx');

    assert.match(pageTabs, /currentTab\.viewType === LibraryTab\.Programs[\s\S]*<LiveTvCategoriesView/);
    assert.match(pageTabs, /LibraryTab\.Recordings \|\| currentTab\.viewType === LibraryTab\.Schedule/);
    assert.match(pageTabs, /<ProgramsSectionView/);
});

test('modern category navigation is URL-backed and restores focused channel context', async () => {
    const view = await readModern('components/LiveTvCategoriesView.tsx');

    assert.match(view, /CATEGORY_ID_PARAM = 'categoryId'/);
    assert.match(view, /CATEGORY_START_INDEX_PARAM = 'categoryStartIndex'/);
    assert.match(view, /setSearchParams\(nextParams, \{ state: nextState \}\)/);
    assert.match(view, /setSearchParams\(nextParams, \{[\s\S]*replace: true/);
    assert.match(view, /navigate\(-1\)/);
    assert.match(view, /CHANNEL_FOCUS_HISTORY_STATE/);
    assert.match(view, /onFocusCapture=\{rememberChannelFocus\}/);
    assert.match(view, /element\.dataset\.id === channelId/);
    assert.match(view, /window\.history\.replaceState/);
    assert.match(view, /focusManager\.focus\(focusTarget\)/);
});

test('modern category API calls retain auth, cancellation and stock card behavior', async () => {
    const [ view, api ] = await Promise.all([
        readModern('components/LiveTvCategoriesView.tsx'),
        readModern('hooks/api/useLiveTvCategories.ts')
    ]);

    assert.match(api, /api\.configuration\.baseOptions/);
    assert.match(api, /signal/);
    assert.match(api, /encodeURIComponent\(categoryId\)/);
    assert.match(api, /api\?\.basePath/);
    assert.match(api, /currentApi\.user\?\.Id/);
    assert.match(view, /<ItemsContainer/);
    assert.match(view, /<Cards items=\{items\} cardOptions=\{cardOptions\}/);
    assert.match(view, /showCurrentProgram: true/);
});

test('modern category icons are SVG components rather than ligature text', async () => {
    const view = await readModern('components/LiveTvCategoriesView.tsx');

    assert.match(view, /@mui\/icons-material\/SportsSoccer/);
    assert.match(view, /<Icon aria-hidden/);
    assert.doesNotMatch(view, /material-icons|textContent\s*=\s*['"](?:sports_soccer|chevron_right)/);
});
