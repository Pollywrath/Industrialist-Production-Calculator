import type { Recipe } from '../../../types/data';
import { getSpecialRecipe } from '../../../data/registry';
import { useNodeEditorStore } from './NodeEditorContext';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import styles from './NodeEditor.module.css';

interface SettingsEditorProps {
  recipe: Recipe;
}

export function SettingsEditor({ recipe }: SettingsEditorProps) {
  const sr = getSpecialRecipe(recipe.id);
  const settings = useNodeEditorStore((s) => s.settings);
  const updateSetting = useNodeEditorStore((s) => s.updateSetting);

  if (!sr) {
    return (
      <div className={styles['node-editor-empty']}>No settings available for this recipe.</div>
    );
  }

  return (
    <div className={styles['settings-editor']}>
      {Object.entries(sr.settings).map(([key, def]) => {
        const value = settings[key] ?? def.default;

        return (
          <div key={key} className={styles['node-editor-group']}>
            <label>{def.label}</label>
            {def.type === 'number' && (
              <ValidatedNumberInput
                value={value as number}
                onChange={(val) => updateSetting(key, val)}
                defaultValue={def.default as number}
                allowDecimals={true}
                allowNegatives={true}
                min={def.min}
                max={def.max}
                step={def.step}
                className={styles['node-editor-input']}
              />
            )}
            {def.type === 'select' && (
              <select
                value={value as string}
                onChange={(e) => updateSetting(key, e.target.value)}
                className={styles['node-editor-input']}
              >
                {def.options.map((opt) => (
                  <option key={String(opt.value)} value={opt.value as string | number}>
                    {def.options.find((o) => o.value === opt.value)?.label ?? String(opt.value)}
                  </option>
                ))}
              </select>
            )}
            {/* TODO: Add 'product' type support if needed */}
          </div>
        );
      })}
    </div>
  );
}
