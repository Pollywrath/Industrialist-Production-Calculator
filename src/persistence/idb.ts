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
}

const DB_NAME = 'industrialist_saves_db';
const DB_VERSION = 2;

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
      },
    }).catch((err) => {
      console.warn('IndexedDB failed to open (Incognito mode or quota limit), resetting promise cache:', err);
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

/**
 * Clears the active session (autosave) and data overrides.
 * Preserves the manual saves library.
 * Used by the ErrorBoundary to recover from crash loops.
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  if (!db) return;

  await Promise.all([
    db.clear('autosave'),
    db.clear('data_overrides'),
  ]);
}
