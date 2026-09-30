import { useFlowStore } from '../stores/useFlowStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { saveCurrentAutosave } from './autosaveWriter';
import { getAutosaveTabId } from './autosaveIdentity';

export async function flushAutosave(tabId = getAutosaveTabId()): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const saved = await saveCurrentAutosave(tabId);
    const flowAfter = useFlowStore.getState();
    const settingsAfter = useGlobalSettingsStore.getState();
    if (
      saved.nodes === flowAfter.nodes &&
      saved.edges === flowAfter.edges &&
      saved.settings === settingsAfter
    ) {
      return;
    }
  }

  throw new Error('The graph kept changing while it was being saved. Please retry the update.');
}
