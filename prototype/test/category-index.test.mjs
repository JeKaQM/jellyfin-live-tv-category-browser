import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { buildCategoryIndex, stableCategoryId } from '../category-index.mjs';

test('builds dynamic categories and merges exact duplicates', () => {
    const index = buildCategoryIndex([
        { externalId: '1', name: 'BBC One', channelGroup: 'EU | UK GENERAL' },
        { externalId: '2', name: 'ITV1', channelGroup: 'EU | UK GENERAL' },
        { externalId: '3', name: 'Sky Sports F1', channelGroup: 'EU | UK SPORT' }
    ]);

    assert.deepEqual(index.categories.map(({ name, channelCount }) => ({ name, channelCount })), [
        { name: 'EU | UK GENERAL', channelCount: 2 },
        { name: 'EU | UK SPORT', channelCount: 1 }
    ]);
});

test('preserves Unicode and punctuation without using the raw name as an ID', () => {
    const names = [
        'EU | УКРАЇНА',
        'Kids / Family & Learning',
        "Côte d'Ivoire"
    ];
    const index = buildCategoryIndex(names.map((channelGroup, i) => ({
        externalId: String(i),
        name: `Channel ${i}`,
        channelGroup
    })));

    for (const category of index.categories) {
        assert.ok(names.includes(category.name));
        assert.match(category.id, /^category-[A-Za-z0-9_-]{43}$/);
        assert.ok(!category.id.includes(category.name));
        assert.equal(category.id, stableCategoryId(category.name));
    }
});

test('keeps null, empty and whitespace-only groups accessible as Uncategorised', () => {
    const index = buildCategoryIndex([
        { externalId: '1', name: 'One', channelGroup: null },
        { externalId: '2', name: 'Two', channelGroup: '' },
        { externalId: '3', name: 'Three', channelGroup: '   ' }
    ]);

    assert.equal(index.categories.length, 1);
    assert.equal(index.categories[0].name, 'Uncategorised');
    assert.equal(index.categories[0].channelCount, 3);
});

test('paginates only the selected category and caps oversized limits', () => {
    const channels = Array.from({ length: 600 }, (_, i) => ({
        externalId: `sport-${i}`,
        name: `Sport ${i}`,
        number: i + 1,
        channelGroup: 'UK Sport'
    }));
    const index = buildCategoryIndex(channels);
    const categoryId = index.categories[0].id;

    const firstPage = index.getPage(categoryId, { startIndex: 0, limit: 50 });
    assert.equal(firstPage.Items.length, 50);
    assert.equal(firstPage.TotalRecordCount, 600);

    const cappedPage = index.getPage(categoryId, { startIndex: 250, limit: 10_000 });
    assert.equal(cappedPage.Items.length, 250);
    assert.equal(cappedPage.Items[0].externalId, 'sport-250');
    assert.equal(index.getPage('missing-category'), null);
});

test('handles the verified 27,740-entry/321-group scale while keeping the public summary small', () => {
    const entryCount = 27_740;
    const categoryCount = 321;
    const channels = Array.from({ length: entryCount }, (_, i) => ({
        externalId: `channel-${i}`,
        name: `Channel ${i}`,
        number: i + 1,
        channelGroup: `Category ${String(i % categoryCount).padStart(2, '0')}`,
        path: `https://provider.invalid/secret/${i}`
    }));

    const started = performance.now();
    const index = buildCategoryIndex(channels);
    const elapsedMs = performance.now() - started;
    const serializedSummary = JSON.stringify(index.categories);

    assert.equal(index.categories.length, categoryCount);
    assert.equal(index.totalChannelCount, entryCount);
    assert.ok(Buffer.byteLength(serializedSummary) < 100_000);
    assert.ok(!serializedSummary.includes('provider.invalid'));
    assert.ok(elapsedMs < 2_000, `index build took ${elapsedMs.toFixed(1)} ms`);
});

test('a rebuilt index reflects added and removed provider categories', () => {
    const before = buildCategoryIndex([
        { externalId: '1', name: 'One', channelGroup: 'UK General' },
        { externalId: '2', name: 'Two', channelGroup: 'Ukraine' }
    ]);
    const after = buildCategoryIndex([
        { externalId: '1', name: 'One', channelGroup: 'UK General' },
        { externalId: '3', name: 'Three', channelGroup: 'Germany' }
    ]);

    assert.deepEqual(before.categories.map(({ name }) => name), ['UK General', 'Ukraine']);
    assert.deepEqual(after.categories.map(({ name }) => name), ['Germany', 'UK General']);
});
