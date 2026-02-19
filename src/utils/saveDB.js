// IndexedDB utility for managing canvas saves
// LocalStorage remains for: defaults, data, user preferences, and canvas state

const DB_NAME = 'industrialist_db';
const DB_VERSION = 1;
const STORE_NAME = 'canvas_saves';
const CURRENT_SAVE_KEY = 'industrialist_current_save_id'; // Still in localStorage

let dbInstance = null;

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB failed to open:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        objectStore.createIndex('name', 'name', { unique: false });
      }
    };
  });
};

/**
 * Get all saves from IndexedDB
 * @returns {Promise<Object>} Object with save IDs as keys
 */
export const getSaves = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const savesArray = request.result;
        const savesObject = {};
        savesArray.forEach(save => {
          savesObject[save.id] = save;
        });
        resolve(savesObject);
      };

      request.onerror = () => {
        console.error('Error getting saves:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error accessing IndexedDB:', error);
    return {};
  }
};

/**
 * Save current canvas to IndexedDB
 * @param {string} name - Save name
 * @param {Object} canvasData - Canvas data to save
 * @returns {Promise<Object|null>} Saved object or null on failure
 */
export const saveCurrent = async (name, canvasData) => {
  try {
    const db = await initDB();
    const id = `save_${Date.now()}`;
    const cleanedEdges = (canvasData.edges || []).map(e => {
      const { edgePath, edgeStyle, ...restData } = e.data || {};
      return { ...e, data: restData };
    });
    const save = {
      id,
      name: name || 'Untitled Save',
      timestamp: Date.now(),
      nodeCount: canvasData.nodes?.length || 0,
      data: { ...canvasData, edges: cleanedEdges }
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.add(save);

      request.onsuccess = () => {
        localStorage.setItem(CURRENT_SAVE_KEY, id);
        resolve(save);
      };

      request.onerror = () => {
        console.error('Error saving canvas:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error saving to IndexedDB:', error);
    return null;
  }
};

/**
 * Load a save from IndexedDB
 * @param {string} saveId - Save ID to load
 * @returns {Promise<Object|null>} Save data or null
 */
export const loadSave = async (saveId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(saveId);

      request.onsuccess = () => {
        const save = request.result;
        if (save) {
          localStorage.setItem(CURRENT_SAVE_KEY, saveId);
          resolve(save.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('Error loading save:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error loading from IndexedDB:', error);
    return null;
  }
};

/**
 * Delete a save from IndexedDB
 * @param {string} saveId - Save ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteSave = async (saveId) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(saveId);

      request.onsuccess = () => {
        // Clear current save if it was deleted
        const currentSaveId = localStorage.getItem(CURRENT_SAVE_KEY);
        if (currentSaveId === saveId) {
          localStorage.removeItem(CURRENT_SAVE_KEY);
        }
        resolve(true);
      };

      request.onerror = () => {
        console.error('Error deleting save:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error deleting from IndexedDB:', error);
    return false;
  }
};

/**
 * Rename a save in IndexedDB
 * @param {string} saveId - Save ID to rename
 * @param {string} newName - New name for the save
 * @returns {Promise<boolean>} Success status
 */
export const renameSave = async (saveId, newName) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const getRequest = objectStore.get(saveId);

      getRequest.onsuccess = () => {
        const save = getRequest.result;
        if (save) {
          save.name = newName;
          const updateRequest = objectStore.put(save);
          
          updateRequest.onsuccess = () => resolve(true);
          updateRequest.onerror = () => {
            console.error('Error updating save:', updateRequest.error);
            reject(updateRequest.error);
          };
        } else {
          resolve(false);
        }
      };

      getRequest.onerror = () => {
        console.error('Error getting save for rename:', getRequest.error);
        reject(getRequest.error);
      };
    });
  } catch (error) {
    console.error('Error renaming in IndexedDB:', error);
    return false;
  }
};

/**
 * Get current save name from IndexedDB
 * @returns {Promise<string>} Current save name or 'Untitled'
 */
export const getCurrentSaveName = async () => {
  try {
    const currentSaveId = localStorage.getItem(CURRENT_SAVE_KEY);
    if (!currentSaveId) return 'Untitled';

    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(currentSaveId);

      request.onsuccess = () => {
        const save = request.result;
        resolve(save?.name || 'Untitled');
      };

      request.onerror = () => {
        console.error('Error getting current save name:', request.error);
        resolve('Untitled');
      };
    });
  } catch (error) {
    return 'Untitled';
  }
};

/**
 * Migrate saves from localStorage to IndexedDB
 * This runs once on initialization
 * @returns {Promise<void>}
 */
export const migrateSavesFromLocalStorage = async () => {
  const LEGACY_SAVES_KEY = 'industrialist_saves';
  
  try {
    const legacySavesJSON = localStorage.getItem(LEGACY_SAVES_KEY);
    if (!legacySavesJSON) return; // No legacy saves to migrate

    const legacySaves = JSON.parse(legacySavesJSON);
    const saveIds = Object.keys(legacySaves);
    
    if (saveIds.length === 0) {
      localStorage.removeItem(LEGACY_SAVES_KEY);
      return;
    }

    const db = await initDB();
    
    // Check if any saves already exist in IndexedDB
    const existingSaves = await getSaves();
    if (Object.keys(existingSaves).length > 0) {
      // Already migrated, just clean up localStorage
      localStorage.removeItem(LEGACY_SAVES_KEY);
      return;
    }

    // Migrate each save
    for (const saveId of saveIds) {
      const save = legacySaves[saveId];
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.add(save);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error(`Error migrating save ${saveId}:`, request.error);
          resolve(); // Continue with other saves even if one fails
        };
      });
    }

    // Clean up localStorage after successful migration
    localStorage.removeItem(LEGACY_SAVES_KEY);
    console.log(`Migrated ${saveIds.length} saves from localStorage to IndexedDB`);
  } catch (error) {
    console.error('Error during migration:', error);
  }
};

/**
 * Initialize the save system (call this on app startup)
 * @returns {Promise<void>}
 */
export const initializeSaveSystem = async () => {
  try {
    await initDB();
    await migrateSavesFromLocalStorage();
  } catch (error) {
    console.error('Failed to initialize save system:', error);
  }
};