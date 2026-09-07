/**
 * Async key/value store for large blobs (catalogue groups can be several megabytes, which is
 * more than localStorage allows). IndexedDB when available, in-memory otherwise.
 *
 * Every store is **namespaced**: `getKeyValueStore(namespace)` scopes every operation — including
 * `clear()` — to keys under that namespace only, even though every namespace shares one physical
 * IndexedDB database/object store. This matters because `clear()` is a real, user-facing action
 * ("clear downloaded catalogue" in state/catalog.ts) — before namespacing, it called
 * `indexedDB.deleteDatabase`, wiping *everything* in the database. That was harmless only because
 * the catalogue cache was the sole consumer; the first other feature to store data here (Phase
 * C's session persistence) would have had it silently deleted by an unrelated "clear catalogue"
 * click. Namespacing makes that structurally impossible instead of relying on nobody ever adding
 * a second consumer.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** Removes every key in this namespace. Never touches other namespaces sharing the same database. */
  clear(): Promise<void>;
  /** Keys currently stored in this namespace, with the namespace prefix stripped. */
  keys(): Promise<string[]>;
}

const DB_NAME = 'satloc';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        let request: IDBRequest<T>;
        try {
          tx = db.transaction(STORE, mode);
          request = op(tx.objectStore(STORE));
        } catch (err) {
          // NotFoundError (store missing) or InvalidStateError (connection closing): do not leak the handle.
          db.close();
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        // Resolve on commit (not on request success) and close the handle on every outcome.
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        const fail = () => {
          db.close();
          reject(tx.error ?? request.error ?? new Error('IndexedDB transaction failed'));
        };
        tx.onerror = fail;
        tx.onabort = fail;
      }),
  );
}

/** Every key from `prefix` up to (but not including) the next possible string — i.e. every key starting with `prefix`. */
function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

function deletePrefixed(prefix: string): Promise<void> {
  return run('readwrite', (s) => s.delete(prefixRange(prefix))).then(() => undefined);
}

function listPrefixed(prefix: string): Promise<string[]> {
  return openDb().then(
    (db) =>
      new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).openKeyCursor(prefixRange(prefix));
        const keys: string[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          // Every key this module ever writes is a string (see namespacedIndexedDbStore's `prefix + key`),
          // so the cursor's key is always a string too — this is never [object Object].
          keys.push((cursor.key as string).slice(prefix.length));
          cursor.continue();
        };
        tx.oncomplete = () => {
          db.close();
          resolve(keys);
        };
        const fail = () => {
          db.close();
          reject(tx.error ?? request.error ?? new Error('IndexedDB list failed'));
        };
        tx.onerror = fail;
        tx.onabort = fail;
      }),
  );
}

function namespacedIndexedDbStore(namespace: string): KeyValueStore {
  const prefix = `${namespace}:`;
  return {
    get: (key) => run('readonly', (s) => s.get(prefix + key)) as Promise<never>,
    set: (key, value) => run('readwrite', (s) => s.put(value, prefix + key)).then(() => undefined),
    delete: (key) => run('readwrite', (s) => s.delete(prefix + key)).then(() => undefined),
    clear: () => deletePrefixed(prefix),
    keys: () => listPrefixed(prefix),
  };
}

const memory = new Map<string, unknown>();

function namespacedMemoryStore(namespace: string): KeyValueStore {
  const prefix = `${namespace}:`;
  return {
    get: async (key) => memory.get(prefix + key) as never,
    set: async (key, value) => void memory.set(prefix + key, value),
    delete: async (key) => void memory.delete(prefix + key),
    clear: async () => {
      for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
    },
    keys: async () => [...memory.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)),
  };
}

export function getKeyValueStore(namespace: string): KeyValueStore {
  return typeof indexedDB !== 'undefined' ? namespacedIndexedDbStore(namespace) : namespacedMemoryStore(namespace);
}
