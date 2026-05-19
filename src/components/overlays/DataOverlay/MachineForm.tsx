import React from 'react';
import { Cpu } from 'lucide-react';
import { getMachine, getAllMachines, getAllResearches, hasMachineOverride } from '../../../data/lookup';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import { SearchDropdown } from '../../shared/SearchDropdown';
import { CANONICAL_CATEGORY_MAP, UNIQUE_CATEGORIES, UNIQUE_SUBCATEGORIES } from '../../../utils/machineTaxonomy';
import type { Machine, MachineSize } from '../../../types/data';
import { GenericDataFormShell } from './GenericDataFormShell';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import styles from './MachinesTab.module.css';

interface MachineFormProps {
  selectedMachineId: string | null;
  onSelectMachine: (id: string | null) => void;
}

export function MachineForm({ selectedMachineId, onSelectMachine }: MachineFormProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const updateMachinePendingEdit = useDataStore((s) => s.updateMachinePendingEdit);
  const deleteMachine = useDataStore((s) => s.deleteMachine);
  const restoreMachineDefault = useDataStore((s) => s.restoreMachineDefault);
  const dbVersion = useDataStore((s) => s.dbVersion);

  // Bust React Compiler memoization safely before hooks
  const baseline = selectedMachineId ? (dbVersion !== -1 ? getMachine(selectedMachineId) : undefined) : undefined;
  const isModified = selectedMachineId ? (dbVersion !== -1 ? hasMachineOverride(selectedMachineId) : false) : false;
  const pending = selectedMachineId ? pendingEdits.machines[selectedMachineId] : undefined;
  const activeMachine = overlayPendingEdit(baseline, pending);

  if (!selectedMachineId) {
    return (
      <div className={styles['empty-detail']}>
        <Cpu className={styles['empty-icon']} size={40} strokeWidth={1} />
        <div className={styles['empty-title']}>No Machine Selected</div>
        <div className={styles['empty-desc']}>
          Select a machine from the master index list on the left to view or edit its parameters, or click the plus button to create a new custom machine.
        </div>
      </div>
    );
  }

  if (!activeMachine) {
    return (
      <div className={styles['empty-detail']}>
        <Cpu className={styles['empty-icon']} size={40} strokeWidth={1} />
        <div className={styles['empty-title']}>No Machine Selected</div>
        <div className={styles['empty-desc']}>
          Select a machine from the master index list on the left to view or edit its parameters, or click the plus button to create a new custom machine.
        </div>
      </div>
    );
  }

  // 2. Prepare Dropdown Options
  const categoryOptions = [
    ...UNIQUE_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
    { value: 'Removed', label: 'Removed' },
  ];

  // Filter subcategories according to selected category
  const allowedSubs = activeMachine.category && activeMachine.category !== 'Removed'
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

  // Variant options: Base machines (excluding itself, whose variant is 'none' or falsy)
  const baseMachines = getAllMachines().filter(
    (m) => m.id !== selectedMachineId && (m.variant === 'none' || !m.variant)
  );
  const variantOptions = [
    { value: 'none', label: 'None' },
    ...baseMachines.map((m) => ({ value: m.name, label: m.name })),
  ];

  // 3. Event Handlers
  const handleTierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateMachinePendingEdit(selectedMachineId, { tier: parseInt(e.target.value, 10) });
  };

  const handleVariantChange = (newVal: string) => {
    updateMachinePendingEdit(selectedMachineId, { variant: newVal });
  };

  const handleLimitedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateMachinePendingEdit(selectedMachineId, { limited: e.target.checked });
  };

  const handleCategoryChange = (newCat: string) => {
    const updates: Partial<Machine> = { category: newCat };
    // Automatically clamp subcategory to standard if the new category makes the current one invalid
    if (newCat !== 'Removed') {
      const nextSubs = CANONICAL_CATEGORY_MAP[newCat];
      if (nextSubs && !nextSubs.includes(activeMachine.subcategory || '')) {
        updates.subcategory = nextSubs[0] || '';
      }
    }
    updateMachinePendingEdit(selectedMachineId, updates);
  };

  const handleSubcategoryChange = (newSub: string) => {
    updateMachinePendingEdit(selectedMachineId, { subcategory: newSub });
  };

  const handleResearchChange = (newRes: string) => {
    updateMachinePendingEdit(selectedMachineId, { research: newRes });
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
      styles={styles}
      entityLabel="Machine"
      EmptyIcon={Cpu}
    >
      {/* Cost and Tier Row */}
      <div className={styles['form-row-grid']}>
        {/* Editable machine Cost */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Cost ($)</label>
          <ValidatedNumberInput
            value={activeMachine.cost}
            onChange={(val) => updateMachinePendingEdit(selectedMachineId, { cost: val })}
            defaultValue={100}
            allowDecimals={true}
            allowNegatives={false}
            min={0.01}
            className={styles['form-input']}
            placeholder="100.0"
            title="Must be a positive float value (> 0)"
          />
        </div>

        {/* Editable machine Tier */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Machine Tier</label>
          <select
            className={styles['form-select']}
            value={activeMachine.tier || 1}
            onChange={handleTierChange}
          >
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
            <option value={4}>Tier 4</option>
          </select>
        </div>
      </div>

      {/* Size X and Size Y Row */}
      <div className={styles['form-row-grid']}>
        {/* Size X */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Size X (Grid Units)</label>
          <ValidatedNumberInput
            value={activeMachine.size?.x}
            onChange={(val) =>
              updateMachinePendingEdit(selectedMachineId, {
                size: { ...activeMachine.size, x: val } as MachineSize,
              })
            }
            defaultValue={1}
            allowDecimals={false}
            allowNegatives={false}
            min={1}
            className={styles['form-input']}
            placeholder="1"
            title="Must be a positive integer (>= 1)"
          />
        </div>

        {/* Size Y */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Size Y (Grid Units)</label>
          <ValidatedNumberInput
            value={activeMachine.size?.y}
            onChange={(val) =>
              updateMachinePendingEdit(selectedMachineId, {
                size: { ...activeMachine.size, y: val } as MachineSize,
              })
            }
            defaultValue={1}
            allowDecimals={false}
            allowNegatives={false}
            min={1}
            className={styles['form-input']}
            placeholder="1"
            title="Must be a positive integer (>= 1)"
          />
        </div>
      </div>

      {/* Variant and Limited Row */}
      <div className={styles['form-row-grid']}>
        {/* Variant Dropdown */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Variant Of</label>
          <SearchDropdown
            value={activeMachine.variant || 'none'}
            options={variantOptions}
            onChange={handleVariantChange}
            placeholder="Select Base Machine..."
          />
        </div>

        {/* Limited check */}
        <div className={styles['form-group']}>
          <label className={styles['form-label']}>Availability</label>
          <label className={styles['form-group-row']}>
            <input
              type="checkbox"
              className={styles['form-checkbox']}
              checked={!!activeMachine.limited}
              onChange={handleLimitedChange}
            />
            <span className={styles['checkbox-label']}>Limited</span>
          </label>
        </div>
      </div>

      {/* Category SearchDropdown */}
      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Category</label>
        <SearchDropdown
          value={activeMachine.category || ''}
          options={categoryOptions}
          onChange={handleCategoryChange}
          placeholder="Select Category..."
        />
      </div>

      {/* Subcategory SearchDropdown */}
      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Subcategory</label>
        <SearchDropdown
          value={activeMachine.subcategory || ''}
          options={subcategoryOptions}
          onChange={handleSubcategoryChange}
          placeholder="Select Subcategory..."
        />
      </div>

      {/* Required Research Required SearchDropdown */}
      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Required Research</label>
        <SearchDropdown
          value={activeMachine.research || ''}
          options={researchOptions}
          onChange={handleResearchChange}
          placeholder="Select Required Research..."
        />
      </div>
    </GenericDataFormShell>
  );
}
