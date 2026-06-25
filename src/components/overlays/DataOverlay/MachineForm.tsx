import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Cpu } from 'lucide-react';
import {
  getMachine,
  getAllMachines,
  getAllResearches,
  hasMachineOverride,
} from '../../../data/lookup';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import {
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import { SearchDropdown } from '../../shared/SearchDropdown';
import {
  CANONICAL_CATEGORY_MAP,
  UNIQUE_CATEGORIES,
  UNIQUE_SUBCATEGORIES,
} from '../../../utils/machineTaxonomy';
import type { Machine, MachineSize } from '../../../types/data';
import { GenericDataFormShell } from './GenericDataFormShell';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import styles from './DataCrud.module.css';

interface MachineFormProps {
  selectedMachineId: string | null;
  onSelectMachine: (id: string | null) => void;
}

function MachineCostInput({
  value,
  onChange,
  defaultValue = 100,
  dataTutorialDataField,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  defaultValue?: number;
  dataTutorialDataField?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value =
        value === Infinity
          ? 'infinity'
          : value === undefined || value === null
            ? ''
            : value.toString();
    }
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    if (valStr.toLowerCase() === 'infinity') {
      onChange(Infinity);
      return;
    }
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && !valStr.endsWith('.') && valStr !== '-') {
      onChange(Math.max(0.01, parsed));
    }
  };

  const handleBlur = () => {
    const currentValStr = inputRef.current?.value || '';
    if (currentValStr.toLowerCase() === 'infinity') {
      onChange(Infinity);
      if (inputRef.current) {
        inputRef.current.value = 'infinity';
      }
      return;
    }
    const parsed = parseFloat(currentValStr);
    const committed = isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
    if (inputRef.current) {
      inputRef.current.value = committed.toString();
    }
    onChange(committed);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={
        value === Infinity
          ? 'infinity'
          : value === undefined || value === null
            ? ''
            : value.toString()
      }
      onChange={handleChange}
      onBlur={handleBlur}
      className={styles['form-input']}
      placeholder="100.0 or infinity"
      title="Must be a positive float value or 'infinity'"
      data-tutorial-data-field={dataTutorialDataField}
    />
  );
}

export function MachineForm({ selectedMachineId, onSelectMachine }: MachineFormProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const updateMachinePendingEdit = useDataStore((s) => s.updateMachinePendingEdit);
  const deleteMachine = useDataStore((s) => s.deleteMachine);
  const restoreMachineDefault = useDataStore((s) => s.restoreMachineDefault);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const baseline = selectedMachineId
    ? dbVersion !== -1
      ? getMachine(selectedMachineId)
      : undefined
    : undefined;
  const isModified = selectedMachineId
    ? dbVersion !== -1
      ? hasMachineOverride(selectedMachineId)
      : false
    : false;
  const pending = selectedMachineId ? pendingEdits.machines[selectedMachineId] : undefined;
  const activeMachine = overlayPendingEdit(baseline, pending);

  if (!selectedMachineId || !activeMachine) {
    return (
      <GenericDataFormShell
        entityId={selectedMachineId}
        activeEntity={activeMachine ?? null}
        isModified={isModified}
        entityLabel="Machine"
        EmptyIcon={Cpu}
      />
    );
  }

  const categoryOptions = [
    ...UNIQUE_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
    { value: 'Removed', label: 'Removed' },
  ];

  const allowedSubs =
    activeMachine.category && activeMachine.category !== 'Removed'
      ? CANONICAL_CATEGORY_MAP[activeMachine.category]
      : UNIQUE_SUBCATEGORIES;

  const subcategoryOptions = allowedSubs
    ? allowedSubs.map((sub) => ({ value: sub, label: sub }))
    : [];

  const researchList = getAllResearches();
  const researchOptions = [
    { value: '', label: 'None (Default)' },
    ...researchList.map((res) => ({ value: res.id, label: res.name })),
  ];

  const baseMachines = getAllMachines().filter(
    (m) => m.id !== selectedMachineId && (m.variant === 'none' || !m.variant),
  );
  const variantOptions = [
    { value: 'none', label: 'None' },
    ...baseMachines.map((m) => ({ value: m.name, label: m.name })),
  ];

  const handleTierChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!handleTutorialFieldChange('machine.tier', value)) return;
    updateMachinePendingEdit(selectedMachineId, { tier: value });
  };

  const handleVariantChange = (newVal: string) => {
    if (isTutorialActive()) return;
    updateMachinePendingEdit(selectedMachineId, { variant: newVal });
  };

  const handleLimitedChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isTutorialActive()) return;
    updateMachinePendingEdit(selectedMachineId, { limited: e.target.checked });
  };

  const handleCategoryChange = (newCat: string) => {
    if (!handleTutorialFieldChange('machine.category', newCat)) return;
    const updates: Partial<Machine> = { category: newCat };
    if (newCat !== 'Removed') {
      const nextSubs = CANONICAL_CATEGORY_MAP[newCat];
      if (nextSubs && !nextSubs.includes(activeMachine.subcategory || '')) {
        updates.subcategory = nextSubs[0] || '';
      }
    }
    updateMachinePendingEdit(selectedMachineId, updates);
  };

  const handleSubcategoryChange = (newSub: string) => {
    if (!handleTutorialFieldChange('machine.subcategory', newSub)) return;
    updateMachinePendingEdit(selectedMachineId, { subcategory: newSub });
  };

  const handleResearchChange = (newRes: string) => {
    if (isTutorialActive()) return;
    updateMachinePendingEdit(selectedMachineId, { research: newRes });
  };

  const handleTutorialFieldChange = (field: string, value: string | number | boolean) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'data-field' || action.field !== field) return false;
      return completeTutorialAction({ type: 'data-field', field, value });
    }
    return true;
  };

  const handleDelete = () => {
    deleteMachine(selectedMachineId);
    onSelectMachine(null);
  };

  return (
    <GenericDataFormShell
      entityId={selectedMachineId}
      activeEntity={activeMachine}
      isModified={isModified}
      onRestore={() => restoreMachineDefault(selectedMachineId)}
      onDelete={handleDelete}
      onNameChange={(name) => {
        const nextId = updateMachinePendingEdit(selectedMachineId, { name });
        if (nextId && nextId !== selectedMachineId) {
          onSelectMachine(nextId);
        }
      }}
      entityLabel="Machine"
      EmptyIcon={Cpu}
    >
      <div className={styles['form-row-grid']}>
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Cost ($)</label>
          <MachineCostInput
            value={activeMachine.cost}
            onChange={(val) => {
              if (!handleTutorialFieldChange('machine.cost', val)) return;
              updateMachinePendingEdit(selectedMachineId, { cost: val });
            }}
            defaultValue={100}
            dataTutorialDataField="machine.cost"
          />
        </div>

        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Machine Tier</label>
          <select
            className={styles['form-select']}
            value={activeMachine.tier || 1}
            onChange={handleTierChange}
            data-tutorial-data-field="machine.tier"
          >
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
            <option value={4}>Tier 4</option>
          </select>
        </div>
      </div>

      <div className={styles['form-row-grid']}>
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Size X (Grid Units)</label>
          <ValidatedNumberInput
            value={activeMachine.size?.x}
            onChange={(val) =>
              {
                if (!handleTutorialFieldChange('machine.size.x', val)) return;
                updateMachinePendingEdit(selectedMachineId, {
                size: { ...activeMachine.size, x: val } as MachineSize,
                });
              }
            }
            defaultValue={1}
            allowDecimals={false}
            allowNegatives={false}
            min={1}
            className={styles['form-input']}
            placeholder="1"
            title="Must be a positive integer (>= 1)"
            dataTutorialDataField="machine.size.x"
          />
        </div>

        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Size Y (Grid Units)</label>
          <ValidatedNumberInput
            value={activeMachine.size?.y}
            onChange={(val) =>
              {
                if (!handleTutorialFieldChange('machine.size.y', val)) return;
                updateMachinePendingEdit(selectedMachineId, {
                size: { ...activeMachine.size, y: val } as MachineSize,
                });
              }
            }
            defaultValue={1}
            allowDecimals={false}
            allowNegatives={false}
            min={1}
            className={styles['form-input']}
            placeholder="1"
            title="Must be a positive integer (>= 1)"
            dataTutorialDataField="machine.size.y"
          />
        </div>
      </div>

      <div className={styles['form-row-grid']}>
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Variant Of</label>
          <SearchDropdown
            value={activeMachine.variant || 'none'}
            options={variantOptions}
            onChange={handleVariantChange}
            placeholder="Select Base Machine..."
            dataTutorialDataField="machine.variant"
          />
        </div>

        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Availability</label>
          <div className={styles['checkbox-group']}>
            <label className={styles['form-group-row']}>
              <input
                type="checkbox"
                className={styles['form-checkbox']}
                checked={!!activeMachine.limited}
                onChange={handleLimitedChange}
              />
              <span className={styles['checkbox-label']}>Limited</span>
            </label>
            <label className={styles['form-group-row']}>
              <input
                type="checkbox"
                className={styles['form-checkbox']}
                checked={!!activeMachine.sandboxOnly}
                onChange={(e) => {
                  if (isTutorialActive()) return;
                  updateMachinePendingEdit(selectedMachineId, { sandboxOnly: e.target.checked });
                }}
              />
              <span className={styles['checkbox-label']}>Sandbox Only</span>
            </label>
            <label className={styles['form-group-row']}>
              <input
                type="checkbox"
                className={styles['form-checkbox']}
                checked={!!activeMachine.sandboxPlusOnly}
                onChange={(e) => {
                  if (isTutorialActive()) return;
                  updateMachinePendingEdit(selectedMachineId, { sandboxPlusOnly: e.target.checked });
                }}
              />
              <span className={styles['checkbox-label']}>Sandbox+ Only</span>
            </label>
          </div>
        </div>
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Category</label>
        <SearchDropdown
          value={activeMachine.category || ''}
          options={categoryOptions}
          onChange={handleCategoryChange}
          placeholder="Select Category..."
          dataTutorialDataField="machine.category"
        />
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Subcategory</label>
        <SearchDropdown
          value={activeMachine.subcategory || ''}
          options={subcategoryOptions}
          onChange={handleSubcategoryChange}
          placeholder="Select Subcategory..."
          dataTutorialDataField="machine.subcategory"
        />
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Required Research</label>
        <SearchDropdown
          value={activeMachine.research || ''}
          options={researchOptions}
          onChange={handleResearchChange}
          placeholder="Select Required Research..."
          dataTutorialDataField="machine.research"
        />
      </div>
    </GenericDataFormShell>
  );
}
