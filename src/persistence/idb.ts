import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SaveData, SaveRecord, AutosaveRecord } from '../types/saves';

interface SavesDB extends DBSchema {
  saves: {
    key: string;
    value: SaveRecord;
  };
  autosave: {
    key: string;
    value: AutosaveRecord;
  };
  data_overrides: {
    key: string;
    value: { id: string; data: Record<string, unknown> };
  };
  wiki_bucket_cache: {
    key: string;
    value: WikiBucketCacheRecord;
  };
}

const DB_NAME = 'industrialist_saves_db';
const DB_VERSION = 3;

export interface WikiBucketCacheRecord {
  id: string;
  bucket: string;
  querySignature: string;
  rows: Record<string, unknown>[];
  contentHash: string;
  fetchedAt: number;
  checkedAt: number;
}

let dbPromise: Promise<IDBPDatabase<SavesDB> | null> | null = null;

function getDB(): Promise<IDBPDatabase<SavesDB> | null> {
  if (!dbPromise) {
    dbPromise = openDB<SavesDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('saves', { keyPath: 'id' });
          db.createObjectStore('autosave', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('data_overrides')) {
            db.createObjectStore('data_overrides', { keyPath: 'id' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('wiki_bucket_cache')) {
            db.createObjectStore('wiki_bucket_cache', { keyPath: 'id' });
          }
        }
      },
    }).catch((err) => {
      console.warn(
        'IndexedDB failed to open (Incognito mode or quota limit), resetting promise cache:',
        err,
      );
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

export async function getSaves(): Promise<SaveRecord[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    return await db.getAll('saves');
  } catch (err) {
    console.warn('Failed to get saves from IndexedDB:', err);
    return [];
  }
}

export async function saveSave(record: SaveRecord): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.put('saves', record);
    return true;
  } catch (err) {
    console.warn('Failed to save record to IndexedDB:', err);
    return false;
  }
}

export async function deleteSave(id: string): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.delete('saves', id);
    return true;
  } catch (err) {
    console.warn('Failed to delete save from IndexedDB:', err);
    return false;
  }
}

export async function renameSave(id: string, newName: string): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    const record = await db.get('saves', id);
    if (!record) return false;
    record.name = newName;
    record.timestamp = Date.now();
    await db.put('saves', record);
    return true;
  } catch (err) {
    console.warn('Failed to rename save in IndexedDB:', err);
    return false;
  }
}

export async function getAutosave(): Promise<AutosaveRecord | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    const record = await db.get('autosave', 'latest');
    return record ?? null;
  } catch (err) {
    console.warn('Failed to get autosave from IndexedDB:', err);
    return null;
  }
}

export async function saveAutosave(data: SaveData): Promise<void> {
  const db = await getDB();
  if (!db) {
    throw new Error('IndexedDB not available');
  }
  await db.put('autosave', {
    id: 'latest',
    timestamp: Date.now(),
    data,
  });
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  if (!db) return;

  await Promise.all([
    db.clear('autosave'),
    db.clear('data_overrides'),
    db.clear('wiki_bucket_cache'),
  ]);
}

export async function getWikiBucketCache(id: string): Promise<WikiBucketCacheRecord | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    const record = await db.get('wiki_bucket_cache', id);
    return record ?? null;
  } catch (err) {
    console.warn('Failed to get wiki bucket cache from IndexedDB:', err);
    return null;
  }
}

export async function saveWikiBucketCache(record: WikiBucketCacheRecord): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.put('wiki_bucket_cache', record);
    return true;
  } catch (err) {
    console.warn('Failed to save wiki bucket cache in IndexedDB:', err);
    return false;
  }
}

export async function clearWikiBucketCache(): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.clear('wiki_bucket_cache');
    return true;
  } catch (err) {
    console.warn('Failed to clear wiki bucket cache in IndexedDB:', err);
    return false;
  }
}

export async function getDataOverrides(): Promise<{ id: string; data: Record<string, unknown> }[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    return await db.getAll('data_overrides');
  } catch (err) {
    console.warn('Failed to get data overrides from IndexedDB:', err);
    return [];
  }
}

export async function saveDataOverride(
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.put('data_overrides', { id, data });
    return true;
  } catch (err) {
    console.warn('Failed to save data override in IndexedDB:', err);
    return false;
  }
}

export async function batchSaveDataOverrides(
  entries: { id: string; data: Record<string, unknown> }[],
): Promise<boolean> {
  if (entries.length === 0) return true;
  try {
    const db = await getDB();
    if (!db) return false;
    const tx = db.transaction('data_overrides', 'readwrite');
    const store = tx.objectStore('data_overrides');
    for (let i = 0; i < entries.length; i++) {
      store.put(entries[i]);
    }
    await tx.done;
    return true;
  } catch (err) {
    console.warn('Failed to batch-save data overrides in IndexedDB:', err);
    return false;
  }
}

export async function deleteDataOverride(id: string): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.delete('data_overrides', id);
    return true;
  } catch (err) {
    console.warn('Failed to delete data override in IndexedDB:', err);
    return false;
  }
}

export async function clearDataOverrides(): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;
    await db.clear('data_overrides');
    return true;
  } catch (err) {
    console.warn('Failed to clear data overrides in IndexedDB:', err);
    return false;
  }
}

export async function clearCategoryDataOverrides(
  category: 'products' | 'machines' | 'recipes' | 'researches' | 'special_recipes',
): Promise<boolean> {
  try {
    const db = await getDB();
    if (!db) return false;

    const prefix =
      category === 'products'
        ? 'product:'
        : category === 'machines'
          ? 'machine:'
          : category === 'recipes'
            ? 'recipe:'
            : category === 'researches'
              ? 'research:'
              : 'special_recipe:';

    const tx = db.transaction('data_overrides', 'readwrite');
    const store = tx.objectStore('data_overrides');

    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.key.startsWith(prefix)) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return true;
  } catch (err) {
    console.warn(`Failed to clear category overrides for ${category} in IndexedDB:`, err);
    return false;
  }
}
