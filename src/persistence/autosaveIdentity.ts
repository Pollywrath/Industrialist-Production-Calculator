const AUTOSAVE_TAB_KEY = 'industrialist.autosave.tab-id';
let currentId: string | undefined;

function createId(): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `tab:${randomPart}`;
}

export function getAutosaveTabId(): string {
  if (currentId) return currentId;
  try {
    const existingId = window.sessionStorage.getItem(AUTOSAVE_TAB_KEY);
    if (existingId) {
      currentId = existingId;
      return existingId;
    }

    const newId = createId();
    window.sessionStorage.setItem(AUTOSAVE_TAB_KEY, newId);
    currentId = newId;
    return newId;
  } catch {
    currentId = 'latest';
    return 'latest';
  }
}

export function rotateAutosaveTabId(): string {
  try {
    const newId = createId();
    currentId = newId;
    window.sessionStorage.setItem(AUTOSAVE_TAB_KEY, newId);
    return newId;
  } catch {
    currentId = 'latest';
    return 'latest';
  }
}
