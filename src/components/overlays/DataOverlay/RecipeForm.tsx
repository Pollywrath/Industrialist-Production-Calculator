import { ClipboardList, Plus, Trash2, Info } from 'lucide-react';
import {
  getRecipe,
  getAllMachines,
  getAllProducts,
  hasRecipeOverride,
} from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
import { buildVirtualModularMachines } from '../../../utils/modularMachineFactory';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import { GenericDataFormShell } from './GenericDataFormShell';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import { SearchDropdown } from '../../shared/SearchDropdown';
import type {
  HandleDataType,
  Machine,
  Product,
  RecipeInput,
  RecipeOutput,
} from '../../../types/data';
import crudStyles from './DataCrud.module.css';
import styles from './RecipesTab.module.css';

interface RecipeFormProps {
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string | null) => void;
}

export function RecipeForm({ selectedRecipeId, onSelectRecipe }: RecipeFormProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const updateRecipePendingEdit = useDataStore((s) => s.updateRecipePendingEdit);
  const deleteRecipe = useDataStore((s) => s.deleteRecipe);
  const restoreRecipeDefault = useDataStore((s) => s.restoreRecipeDefault);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const baseline = selectedRecipeId
    ? dbVersion !== -1
      ? getRecipe(selectedRecipeId)
      : undefined
    : undefined;

  const isModified = selectedRecipeId
    ? dbVersion !== -1
      ? hasRecipeOverride(selectedRecipeId)
      : false
    : false;

  const pending = selectedRecipeId ? pendingEdits.recipes[selectedRecipeId] : undefined;
  const activeRecipe = overlayPendingEdit(baseline, pending);

  const isSpecial = selectedRecipeId ? !!getSpecialRecipe(selectedRecipeId) : false;
  const specialRecipeDef = selectedRecipeId ? getSpecialRecipe(selectedRecipeId) : null;

  const machineOptions: Array<{ value: string; label: string }> = [];
  if (dbVersion !== -1) {
    const machineMap = new Map(getAllMachines().map((machine) => [machine.id, machine]));
    for (const [id, editData] of Object.entries(pendingEdits.machines)) {
      if (editData._tombstone) {
        machineMap.delete(id);
        continue;
      }
      const existing = machineMap.get(id);
      machineMap.set(id, { ...(existing ?? {}), ...editData, id } as Machine);
    }

    const baseMachines = Array.from(machineMap.values());
    const virtuals = buildVirtualModularMachines(baseMachines);
    for (const machine of [...baseMachines, ...virtuals]) {
      machineOptions.push({ value: machine.id, label: machine.name });
    }
  }

  const productOptions: Array<{ value: string; label: string }> = [];
  const productTypeById = new Map<string, Product['type']>();
  if (dbVersion !== -1) {
    const productMap = new Map(getAllProducts().map((product) => [product.id, product]));
    for (const [id, editData] of Object.entries(pendingEdits.products)) {
      if (editData._tombstone) {
        productMap.delete(id);
        continue;
      }
      const existing = productMap.get(id);
      productMap.set(id, { ...(existing ?? {}), ...editData, id } as Product);
    }

    for (const product of productMap.values()) {
      productOptions.push({ value: product.id, label: product.name });
      productTypeById.set(product.id, product.type);
    }
  }

  if (!selectedRecipeId || !activeRecipe) {
    return (
      <GenericDataFormShell
        entityId={selectedRecipeId}
        activeEntity={activeRecipe ?? null}
        isModified={isModified}
        entityLabel="Recipe"
        EmptyIcon={ClipboardList}
      />
    );
  }

  const handleDelete = () => {
    deleteRecipe(selectedRecipeId);
    onSelectRecipe(null);
  };

  const handleTutorialFieldChange = (field: string, value: string | number | boolean) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'data-field' || action.field !== field) return false;
      return completeTutorialAction({ type: 'data-field', field, value });
    }
    return true;
  };

  const handleInputChange = (idx: number, updates: Partial<RecipeInput>) => {
    const nextInputs = [...(activeRecipe.inputs || [])];
    nextInputs[idx] = { ...nextInputs[idx], ...updates };
    updateRecipePendingEdit(selectedRecipeId, { inputs: nextInputs });
  };

  const handleInputHandleTypeChange = (idx: number, value: string) => {
    const nextInputs = [...(activeRecipe.inputs || [])];
    const nextInput = { ...nextInputs[idx] };
    if (value === 'auto') {
      delete nextInput.handle_type;
    } else {
      nextInput.handle_type = value as HandleDataType;
    }
    nextInputs[idx] = nextInput;
    updateRecipePendingEdit(selectedRecipeId, { inputs: nextInputs });
  };

  const handleAddInput = () => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'data-command', id: 'recipe.add-input' })
    ) {
      return;
    }
    const nextInputs = [...(activeRecipe.inputs || [])];
    const defaultProduct = getAllProducts()[0]?.id || 'p_water';
    nextInputs.push({ product_id: defaultProduct, quantity: 1, variable: false });
    updateRecipePendingEdit(selectedRecipeId, { inputs: nextInputs });
    completeTutorialAction({ type: 'data-command', id: 'recipe.add-input' });
  };

  const handleRemoveInput = (idx: number) => {
    const nextInputs = (activeRecipe.inputs || []).filter((_, i) => i !== idx);
    updateRecipePendingEdit(selectedRecipeId, { inputs: nextInputs });
  };

  const handleOutputChange = (idx: number, updates: Partial<RecipeOutput>) => {
    const nextOutputs = [...(activeRecipe.outputs || [])];
    nextOutputs[idx] = { ...nextOutputs[idx], ...updates };
    updateRecipePendingEdit(selectedRecipeId, { outputs: nextOutputs });
  };

  const handleOutputHandleTypeChange = (idx: number, value: string) => {
    const nextOutputs = [...(activeRecipe.outputs || [])];
    const nextOutput = { ...nextOutputs[idx] };
    if (value === 'auto') {
      delete nextOutput.handle_type;
    } else {
      nextOutput.handle_type = value as HandleDataType;
    }
    nextOutputs[idx] = nextOutput;
    updateRecipePendingEdit(selectedRecipeId, { outputs: nextOutputs });
  };

  const handleAddOutput = () => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'data-command', id: 'recipe.add-output' })
    ) {
      return;
    }
    const nextOutputs = [...(activeRecipe.outputs || [])];
    const defaultProduct = getAllProducts()[0]?.id || 'p_water';
    nextOutputs.push({ product_id: defaultProduct, quantity: 1, temperature: 18, variable: false, voidable: false });
    updateRecipePendingEdit(selectedRecipeId, { outputs: nextOutputs });
    completeTutorialAction({ type: 'data-command', id: 'recipe.add-output' });
  };

  const handleRemoveOutput = (idx: number) => {
    const nextOutputs = (activeRecipe.outputs || []).filter((_, i) => i !== idx);
    updateRecipePendingEdit(selectedRecipeId, { outputs: nextOutputs });
  };

  const getAutoHandleTypeLabel = (productId: string) => {
    const productType = productTypeById.get(productId);
    if (productType === 'Item') return 'Item';
    if (productType === 'Fluid') return 'Fluid';
    return 'Unknown';
  };

  return (
    <GenericDataFormShell
      entityId={selectedRecipeId}
      activeEntity={activeRecipe}
      isModified={isModified}
      onRestore={() => restoreRecipeDefault(selectedRecipeId)}
      onDelete={handleDelete}
      onNameChange={(name) => {
        if (isSpecial) return;
        const nextId = updateRecipePendingEdit(selectedRecipeId, { name });
        if (nextId && nextId !== selectedRecipeId) {
          onSelectRecipe(nextId);
        }
      }}
      entityLabel={isSpecial ? "Special Recipe" : "Recipe"}
      EmptyIcon={ClipboardList}
      isReadOnly={isSpecial}
    >
      {isSpecial && (
        <div className={styles['special-recipe-alert-box']}>
          <div className={styles['alert-header']}>
            <Info size={14} />
            <span>Special Formula Recipe</span>
          </div>
          <p className={styles['alert-message']}>
            This recipe's inputs, outputs, cycle times, power consumptions, and pollutions are dynamically
            calculated by its mathematical code formula. They cannot be statically overridden in the database.
          </p>
        </div>
      )}

      {isSpecial && specialRecipeDef?.description && (
        <div className={styles['recipe-formula-desc']}>
          <span className={crudStyles['form-label']}>Formula Description</span>
          <p className={styles['formula-text']}>{specialRecipeDef.description}</p>
        </div>
      )}

      <div className={crudStyles['form-row-grid']}>
        <div className={crudStyles['form-group']}>
          <label className={crudStyles['form-label']}>Crafted In (Machine)</label>
          {isSpecial ? (
            <input
              type="text"
              className={crudStyles['form-input-readonly']}
              value={activeRecipe.machine_id}
              disabled
            />
          ) : (
            <SearchDropdown
              value={activeRecipe.machine_id}
              options={machineOptions}
              onChange={(val) => {
                if (!handleTutorialFieldChange('recipe.machine_id', val)) return;
                const nextId = updateRecipePendingEdit(selectedRecipeId, { machine_id: val });
                if (nextId && nextId !== selectedRecipeId) {
                  onSelectRecipe(nextId);
                }
              }}
              placeholder="Select Machine..."
              dataTutorialDataField="recipe.machine_id"
            />
          )}
        </div>

        <div className={crudStyles['form-group']}>
          <label className={crudStyles['form-label']}>Power Consumption (W)</label>
          <ValidatedNumberInput
            value={activeRecipe.power_consumption}
            onChange={(val) => {
              if (!handleTutorialFieldChange('recipe.power_consumption', val)) return;
              updateRecipePendingEdit(selectedRecipeId, { power_consumption: val });
            }}
            defaultValue={100}
            allowDecimals={true}
            allowNegatives={false}
            min={0}
            className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
            disabled={isSpecial}
            dataTutorialDataField="recipe.power_consumption"
          />
        </div>
      </div>

      <div className={crudStyles['form-row-grid']}>
        <div className={crudStyles['form-group']}>
          <label className={crudStyles['form-label']}>Cycle Time (seconds)</label>
          <ValidatedNumberInput
            value={activeRecipe.cycle_time}
            onChange={(val) => {
              if (!handleTutorialFieldChange('recipe.cycle_time', val)) return;
              updateRecipePendingEdit(selectedRecipeId, { cycle_time: val });
            }}
            defaultValue={1}
            allowDecimals={true}
            allowNegatives={false}
            min={0.01}
            className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
            disabled={isSpecial}
            dataTutorialDataField="recipe.cycle_time"
          />
        </div>

        <div className={crudStyles['form-group']}>
          <label className={crudStyles['form-label']}>Power Connection Tier</label>
          <select
            className={isSpecial ? crudStyles['form-select-readonly'] : crudStyles['form-select']}
            value={activeRecipe.power_type || 'MV'}
            onChange={(e) => {
              if (isTutorialActive()) return;
              updateRecipePendingEdit(selectedRecipeId, { power_type: e.target.value as 'MV' | 'HV' });
            }}
            disabled={isSpecial}
          >
            <option value="MV">MV Tier</option>
            <option value="HV">HV Tier</option>
          </select>
        </div>
      </div>

      <div className={crudStyles['form-group']}>
        <label className={crudStyles['form-label']}>Base Pollution Rate</label>
        <ValidatedNumberInput
          value={activeRecipe.pollution}
          onChange={(val) => {
            if (!handleTutorialFieldChange('recipe.pollution', val)) return;
            updateRecipePendingEdit(selectedRecipeId, { pollution: val });
          }}
          defaultValue={0}
          allowDecimals={true}
          allowNegatives={true}
          className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
          disabled={isSpecial}
          dataTutorialDataField="recipe.pollution"
        />
      </div>

      {isSpecial && specialRecipeDef && Object.keys(specialRecipeDef.settings).length > 0 && (
        <div className={styles['special-settings-list']}>
          <span className={crudStyles['form-label']}>Recipe Formula Variables</span>
          <div className={styles['variables-grid']}>
            {Object.entries(specialRecipeDef.settings).map(([key, def]) => (
              <div key={key} className={styles['variable-card']}>
                <div className={styles['variable-label']}>{def.label}</div>
                <div className={styles['variable-meta']}>
                  Type: <code>{def.type}</code> | Default: <code>{String(def.default)}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles['recipe-io-section']}>
        <div className={styles['io-header-row']}>
          <span className={crudStyles['form-label']}>Recipe Inputs (Reagents)</span>
          {!isSpecial && (
            <button
              type="button"
              className={styles['btn-add-io']}
              onClick={handleAddInput}
              title="Add Input Product"
              data-tutorial-data-command="recipe.add-input"
            >
              <Plus size={12} /> Add Input
            </button>
          )}
        </div>

        <div className={styles['io-table']}>
          <div className={styles['io-table-header']}>
            <div className={styles['col-product']}>Product</div>
            <div className={styles['col-quantity']}>Qty</div>
            <div className={styles['col-handle-type']}>Handle</div>
            <div className={styles['col-checkbox']}>Sink (Max)</div>
            {!isSpecial && <div className={styles['col-action']}></div>}
          </div>

          {(activeRecipe.inputs || []).length === 0 ? (
            <div className={styles['io-empty-row']}>No inputs defined</div>
          ) : (
            (activeRecipe.inputs || []).map((input, idx) => (
              <div key={`${input.product_id}-${idx}`} className={styles['io-table-row']}>
                <div className={styles['col-product']}>
                  {isSpecial ? (
                    <span className={styles['readonly-text']}>{input.product_id}</span>
                  ) : (
                    <SearchDropdown
                      value={input.product_id}
                      options={productOptions}
                      onChange={(val) => {
                        const field = `recipe.input.${idx}.product_id`;
                        if (!handleTutorialFieldChange(field, val)) return;
                        handleInputChange(idx, { product_id: val });
                      }}
                      dataTutorialDataField={`recipe.input.${idx}.product_id`}
                    />
                  )}
                </div>
                <div className={styles['col-quantity']}>
                  <ValidatedNumberInput
                    value={input.quantity}
                    onChange={(val) => {
                      const field = `recipe.input.${idx}.quantity`;
                      if (!handleTutorialFieldChange(field, val)) return;
                      handleInputChange(idx, { quantity: val });
                    }}
                    defaultValue={1}
                    allowDecimals={true}
                    allowNegatives={false}
                    min={0.0001}
                    className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
                    disabled={isSpecial}
                    dataTutorialDataField={`recipe.input.${idx}.quantity`}
                  />
                </div>
                <div className={styles['col-handle-type']}>
                  <select
                    className={styles['io-handle-type-select']}
                    value={input.handle_type ?? 'auto'}
                    onChange={(e) => {
                      if (isTutorialActive()) return;
                      handleInputHandleTypeChange(idx, e.target.value);
                    }}
                    disabled={isSpecial}
                    title="Recipe handle type"
                  >
                    <option value="auto">Auto: {getAutoHandleTypeLabel(input.product_id)}</option>
                    <option value="item">Item</option>
                    <option value="fluid">Fluid</option>
                  </select>
                </div>
                <div className={styles['col-checkbox']}>
                  <input
                    type="checkbox"
                    checked={!!input.variable}
                    onChange={(e) => {
                      if (isTutorialActive()) return;
                      handleInputChange(idx, { variable: e.target.checked });
                    }}
                    disabled={isSpecial}
                  />
                </div>
                {!isSpecial && (
                  <div className={styles['col-action']}>
                    <button
                      type="button"
                      className={styles['btn-remove-io']}
                      onClick={() => {
                        if (isTutorialActive()) return;
                        handleRemoveInput(idx);
                      }}
                      title="Remove Input"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles['recipe-io-section']}>
        <div className={styles['io-header-row']}>
          <span className={crudStyles['form-label']}>Recipe Outputs (Products)</span>
          {!isSpecial && (
            <button
              type="button"
              className={styles['btn-add-io']}
              onClick={handleAddOutput}
              title="Add Output Product"
              data-tutorial-data-command="recipe.add-output"
            >
              <Plus size={12} /> Add Output
            </button>
          )}
        </div>

        <div className={styles['io-table']}>
          <div className={styles['io-table-header']}>
            <div className={styles['col-product']}>Product</div>
            <div className={styles['col-quantity']}>Qty</div>
            <div className={styles['col-temp']}>Temp (°C)</div>
            <div className={styles['col-handle-type']}>Handle</div>
            <div className={styles['col-checkbox-small']}>Sink</div>
            <div className={styles['col-checkbox-small']}>Void</div>
            {!isSpecial && <div className={styles['col-action']}></div>}
          </div>

          {(activeRecipe.outputs || []).length === 0 ? (
            <div className={styles['io-empty-row']}>No outputs defined</div>
          ) : (
            (activeRecipe.outputs || []).map((output, idx) => (
              <div key={`${output.product_id}-${idx}`} className={styles['io-table-row']}>
                <div className={styles['col-product']}>
                  {isSpecial ? (
                    <span className={styles['readonly-text']}>{output.product_id}</span>
                  ) : (
                    <SearchDropdown
                      value={output.product_id}
                      options={productOptions}
                      onChange={(val) => {
                        const field = `recipe.output.${idx}.product_id`;
                        if (!handleTutorialFieldChange(field, val)) return;
                        handleOutputChange(idx, { product_id: val });
                      }}
                      dataTutorialDataField={`recipe.output.${idx}.product_id`}
                    />
                  )}
                </div>
                <div className={styles['col-quantity']}>
                  <ValidatedNumberInput
                    value={output.quantity}
                    onChange={(val) => {
                      const field = `recipe.output.${idx}.quantity`;
                      if (!handleTutorialFieldChange(field, val)) return;
                      handleOutputChange(idx, { quantity: val });
                    }}
                    defaultValue={1}
                    allowDecimals={true}
                    allowNegatives={false}
                    min={0.0001}
                    className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
                    disabled={isSpecial}
                    dataTutorialDataField={`recipe.output.${idx}.quantity`}
                  />
                </div>
                <div className={styles['col-temp']}>
                  <ValidatedNumberInput
                    value={output.temperature}
                    onChange={(val) => {
                      if (isTutorialActive()) return;
                      handleOutputChange(idx, { temperature: val });
                    }}
                    defaultValue={18}
                    allowDecimals={true}
                    allowNegatives={true}
                    className={isSpecial ? crudStyles['form-input-readonly'] : crudStyles['form-input']}
                    disabled={isSpecial}
                  />
                </div>
                <div className={styles['col-handle-type']}>
                  <select
                    className={styles['io-handle-type-select']}
                    value={output.handle_type ?? 'auto'}
                    onChange={(e) => {
                      if (isTutorialActive()) return;
                      handleOutputHandleTypeChange(idx, e.target.value);
                    }}
                    disabled={isSpecial}
                    title="Recipe handle type"
                  >
                    <option value="auto">Auto: {getAutoHandleTypeLabel(output.product_id)}</option>
                    <option value="item">Item</option>
                    <option value="fluid">Fluid</option>
                  </select>
                </div>
                <div className={styles['col-checkbox-small']}>
                  <input
                    type="checkbox"
                    checked={!!output.variable}
                    onChange={(e) => {
                      if (isTutorialActive()) return;
                      handleOutputChange(idx, { variable: e.target.checked });
                    }}
                    disabled={isSpecial}
                  />
                </div>
                <div className={styles['col-checkbox-small']}>
                  <input
                    type="checkbox"
                    checked={!!output.voidable}
                    onChange={(e) => {
                      if (isTutorialActive()) return;
                      handleOutputChange(idx, { voidable: e.target.checked });
                    }}
                    disabled={isSpecial}
                  />
                </div>
                {!isSpecial && (
                  <div className={styles['col-action']}>
                    <button
                      type="button"
                      className={styles['btn-remove-io']}
                      onClick={() => {
                        if (isTutorialActive()) return;
                        handleRemoveOutput(idx);
                      }}
                      title="Remove Output"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </GenericDataFormShell>
  );
}
