import { beforeEach, describe, expect, it } from 'vitest';
import { getKeyValueStore } from './kv';

/**
 * This suite runs in Node (no IndexedDB), so it exercises the in-memory fallback store — the same
 * one a browser with IndexedDB blocked would fall back to. It shares the exact namespace-prefix
 * logic the IndexedDB-backed store uses (see kv.ts's namespacedIndexedDbStore), so it verifies the
 * namespacing design even though the real IndexedDB cursor/range code path itself isn't covered
 * here (consistent with the rest of src/platform/, which has no browser-API test coverage and is
 * verified manually/via e2e instead).
 */
describe('getKeyValueStore', () => {
  beforeEach(async () => {
    // The in-memory fallback is a module-level singleton Map shared across namespaces — clear
    // every namespace this suite touches so tests don't leak into each other.
    await getKeyValueStore('a').clear();
    await getKeyValueStore('b').clear();
  });

  it('get/set/delete round-trip within a namespace', async () => {
    const store = getKeyValueStore('a');
    await store.set('key1', { value: 42 });
    await expect(store.get('key1')).resolves.toEqual({ value: 42 });

    await store.delete('key1');
    await expect(store.get('key1')).resolves.toBeUndefined();
  });

  it('keeps two namespaces fully isolated for the same key name', async () => {
    const a = getKeyValueStore('a');
    const b = getKeyValueStore('b');
    await a.set('shared-key', 'a-value');
    await b.set('shared-key', 'b-value');

    await expect(a.get('shared-key')).resolves.toBe('a-value');
    await expect(b.get('shared-key')).resolves.toBe('b-value');
  });

  it("clear() on one namespace never touches another namespace's data", async () => {
    const a = getKeyValueStore('a');
    const b = getKeyValueStore('b');
    await a.set('key1', 'a1');
    await a.set('key2', 'a2');
    await b.set('key1', 'b1');

    await a.clear();

    await expect(a.get('key1')).resolves.toBeUndefined();
    await expect(a.get('key2')).resolves.toBeUndefined();
    await expect(b.get('key1')).resolves.toBe('b1'); // untouched
  });

  it("keys() lists only this namespace's keys, with the namespace prefix stripped", async () => {
    const a = getKeyValueStore('a');
    const b = getKeyValueStore('b');
    await a.set('one', 1);
    await a.set('two', 2);
    await b.set('three', 3);

    const keys = await a.keys();
    expect(keys.sort()).toEqual(['one', 'two']);
  });
});
