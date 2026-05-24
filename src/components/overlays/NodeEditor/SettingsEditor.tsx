import { useNodeConnections } from '@xyflow/react';
import type { Recipe } from '../../../types/data';
import type { SettingDefinition } from '../../../types/specialRecipes';
import { getSpecialRecipe } from '../../../data/registry';
import { useNodeEditorStore } from './NodeEditorContext';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
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
}

function SettingItem({
  nodeId,
  settingKey,
  def,
  inputIndex,
  value,
  updateSetting,
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

  return (
    <div className={styles['node-editor-group']}>
      <label>{def.label}</label>
      {def.type === 'number' && (
        <ValidatedNumberInput
          value={displayValue as number}
          onChange={(val) => updateSetting(settingKey, val)}
          defaultValue={def.default as number}
          allowDecimals={true}
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
          onChange={(e) => updateSetting(settingKey, e.target.value)}
          className={styles['node-editor-input']}
          disabled={isConnected}
        >
          {def.options.map((opt) => (
            <option key={String(opt.value)} value={opt.value as string | number}>
              {def.options.find((o) => o.value === opt.value)?.label ?? String(opt.value)}
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

  return (
    <div className={styles['settings-editor']}>
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
          />
        );
      })}
    </div>
  );
}
