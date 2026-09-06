/**
 * Async key/value store for large blobs (catalogue groups can be several megabytes, which is
 * more than localStorage allows). IndexedDB when available, in-memory otherwise.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
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

const indexedDbStore: KeyValueStore = {
  get: (key) => run('readonly', (s) => s.get(key)) as Promise<never>,
  set: (key, value) => run('readwrite', (s) => s.put(value, key)).then(() => undefined),
  delete: (key) => run('readwrite', (s) => s.delete(key)).then(() => undefined),
};

const memory = new Map<string, unknown>();
const memoryStore: KeyValueStore = {
  get: async (key) => memory.get(key) as never,
  set: async (key, value) => void memory.set(key, value),
  delete: async (key) => void memory.delete(key),
};

export function getKeyValueStore(): KeyValueStore {
  return typeof indexedDB !== 'undefined' ? indexedDbStore : memoryStore;
}
