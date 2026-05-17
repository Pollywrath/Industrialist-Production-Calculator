import type { Recipe } from '../../../types/data';
import { getSpecialRecipe } from '../../../data/registry';
import { useNodeEditorStore } from './NodeEditorContext';
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
              <input
                type="number"
                value={value as number}
                min={def.min}
                max={def.max}
                step={def.step}
                onChange={(e) => updateSetting(key, parseFloat(e.target.value))}
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
                    {opt.label}
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
