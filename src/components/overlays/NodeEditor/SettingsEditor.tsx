import { useNodeConnections } from '@xyflow/react';
import type { Recipe } from '../../../types/data';
import type { SettingDefinition } from '../../../types/specialRecipes';
import { getSpecialRecipe } from '../../../data/registry';
import { useNodeEditorStore } from './NodeEditorContext';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import { buildHandleId } from '../../../utils/idGenerator';
import { getAllProducts } from '../../../data/lookup';
import styles from './NodeEditor.module.css';

interface SettingsEditorProps {
  recipe: Recipe;
  nodeId: string;
}

interface SettingItemProps {
  nodeId: string;
  settingKey: string;
  def: SettingDefinition;
  inputIndex: number | undefined;
  value: unknown;
  updateSetting: (key: string, val: unknown) => void;
  resolvedSettings: Record<string, unknown>;
  globalSettings: Record<string, unknown>;
}

function SettingItem({
  nodeId,
  settingKey,
  def,
  inputIndex,
  value,
  updateSetting,
  resolvedSettings,
  globalSettings,
}: SettingItemProps) {
  const handleId =
    inputIndex !== undefined
      ? buildHandleId(nodeId, 'input', inputIndex)
      : 'dummy-non-existent-handle';

  const connections = useNodeConnections({
    handleType: 'target',
    handleId,
  });

  const isConnected = inputIndex !== undefined && connections.length > 0;

  const propagatedTemp = useFlowResultStore((s) => s.inputTemps[nodeId]?.[inputIndex ?? -1]);
  const displayValue = isConnected && propagatedTemp !== undefined ? propagatedTemp : value;

  const labelText = def.dynamicLabel
    ? def.dynamicLabel(resolvedSettings, globalSettings)
    : def.label;

  return (
    <div className={styles['node-editor-group']}>
      <label>{labelText}</label>
      {def.type === 'number' && (
        <ValidatedNumberInput
          value={displayValue as number}
          onChange={(val) => updateSetting(settingKey, val)}
          defaultValue={def.default as number}
          allowDecimals={def.step !== 1}
          allowNegatives={true}
          min={def.min}
          max={def.max}
          step={def.step}
          className={styles['node-editor-input']}
          disabled={isConnected}
        />
      )}
      {def.type === 'select' && (
        <select
          value={displayValue as string}
          onChange={(e) => {
            const selectedOption = def.options.find((opt) => String(opt.value) === e.target.value);
            updateSetting(settingKey, selectedOption?.value ?? e.target.value);
          }}
          className={styles['node-editor-input']}
          disabled={isConnected}
        >
          {def.options.map((opt) => (
            <option key={String(opt.value)} value={opt.value as string | number}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {def.type === 'product' && (
        <select
          value={displayValue as string}
          onChange={(e) => updateSetting(settingKey, e.target.value)}
          className={styles['node-editor-input']}
          disabled={isConnected}
        >
          {getAllProducts()
            .filter((p) => p.type === 'Fluid')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

export function SettingsEditor({ recipe, nodeId }: SettingsEditorProps) {
  const sr = getSpecialRecipe(recipe.id);
  const settings = useNodeEditorStore((s) => s.settings);
  const updateSetting = useNodeEditorStore((s) => s.updateSetting);
  const globalSettings = useGlobalSettingsStore((s) => s.settings);
  const edges = useFlowStore((s) => s.edges);
  const inputTempsMap = useFlowResultStore((s) => s.inputTemps[nodeId]);

  if (!sr) {
    return (
      <div className={styles['node-editor-empty']}>No settings available for this recipe.</div>
    );
  }

  const inputToSettingKey = sr.inputTemperatureSettings ?? {};
  const settingKeyToInputIndex: Record<string, number> = {};
  for (const [inpIdxStr, settingK] of Object.entries(inputToSettingKey)) {
    settingKeyToInputIndex[settingK] = Number(inpIdxStr);
  }

  const resolvedSettings = { ...settings };
  if (sr.inputTemperatureSettings && inputTempsMap) {
    for (const [inpIdxStr, settingK] of Object.entries(sr.inputTemperatureSettings)) {
      const inpIdx = Number(inpIdxStr);
      const handleId = buildHandleId(nodeId, 'input', inpIdx);
      const isConnected = edges.some((e) => e.targetHandle === handleId);
      const tempVal = inputTempsMap[inpIdx];
      if (isConnected && tempVal !== undefined) {
        resolvedSettings[settingK] = tempVal;
      }
    }
  }

  return (
    <div className={styles['settings-editor']}>
      {sr.description && (
        <div className={styles['node-editor-description']}>{sr.description}</div>
      )}
      {Object.entries(sr.settings).map(([key, def]) => {
        const value = settings[key] ?? def.default;
        const inputIndex = settingKeyToInputIndex[key];

        return (
          <SettingItem
            key={key}
            nodeId={nodeId}
            settingKey={key}
            def={def}
            inputIndex={inputIndex}
            value={value}
            updateSetting={updateSetting}
            resolvedSettings={resolvedSettings}
            globalSettings={globalSettings as unknown as Record<string, unknown>}
          />
        );
      })}
    </div>
  );
}
