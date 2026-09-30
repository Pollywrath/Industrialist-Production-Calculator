import { useFlowStore } from '../stores/useFlowStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { getDataOverrides, saveAutosave } from './idb';
import { serializeCanvas } from './transformer';

let writeQueue: Promise<void> = Promise.resolve();

export interface AutosaveSnapshotVersion {
  nodes: ReturnType<typeof useFlowStore.getState>['nodes'];
  edges: ReturnType<typeof useFlowStore.getState>['edges'];
  settings: ReturnType<typeof useGlobalSettingsStore.getState>;
}

export function saveCurrentAutosave(tabId: string): Promise<AutosaveSnapshotVersion> {
  const write = writeQueue.then(async () => {
    const flow = useFlowStore.getState();
    const settings = useGlobalSettingsStore.getState();
    const overrides = await getDataOverrides();
    await saveAutosave(serializeCanvas(flow.nodes, flow.edges, overrides), tabId);
    return { nodes: flow.nodes, edges: flow.edges, settings };
  });

  writeQueue = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}
