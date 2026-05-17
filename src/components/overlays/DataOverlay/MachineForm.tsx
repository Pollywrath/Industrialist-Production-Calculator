import React from 'react';
import { Trash2, RotateCcw, Cpu } from 'lucide-react';
import { getMachine, getAllMachines, getAllResearches, hasMachineOverride } from '../../../data/lookup';
import { useDataStore } from '../../../stores/useDataStore';
import { SearchDropdown } from '../../shared/SearchDropdown';
import { CANONICAL_CATEGORY_MAP, UNIQUE_CATEGORIES, UNIQUE_SUBCATEGORIES } from '../../../utils/machineTaxonomy';
import type { Machine, MachineSize } from '../../../types/data';
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

  // 1. Resolve active machine with pending transient overrides
  const emptyState = (
    <div className={styles['empty-detail']}>
      <Cpu className={styles['empty-icon']} size={40} strokeWidth={1} />
      <div className={styles['empty-title']}>No Machine Selected</div>
      <div className={styles['empty-desc']}>
        Select a machine from the master index list on the left to view or edit its parameters, or click the plus button to create a new custom machine.
      </div>
    </div>
  );

  if (!selectedMachineId) {
    return emptyState;
  }

  // Bust React Compiler memoization by including dbVersion in the baseline lookup
  const baseline = dbVersion !== -1 ? getMachine(selectedMachineId) : undefined;
  const isModified = dbVersion !== -1 ? hasMachineOverride(selectedMachineId) : false;
  const pending = pendingEdits.machines[selectedMachineId];

  // If item is tombstoned/deleted in pending edits
  if (pending?._tombstone) {
    return emptyState;
  }

  const activeMachine = pending
    ? { ...baseline, ...pending }
    : baseline;

  if (!activeMachine) {
    return emptyState;
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

  // 3. Event Handlers with Strict Validation Constraints
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateMachinePendingEdit(selectedMachineId, { name: e.target.value });
  };

  const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === '' ? 0.01 : parseFloat(e.target.value);
    const clampedVal = isNaN(val) ? 0.01 : Math.max(0.01, val);
    updateMachinePendingEdit(selectedMachineId, { cost: clampedVal });
  };

  const handleTierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateMachinePendingEdit(selectedMachineId, { tier: parseInt(e.target.value, 10) });
  };

  const handleSizeXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const clampedVal = isNaN(val) ? 1 : Math.max(1, val);
    updateMachinePendingEdit(selectedMachineId, {
      size: { ...activeMachine.size, x: clampedVal } as MachineSize,
    });
  };

  const handleSizeYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const clampedVal = isNaN(val) ? 1 : Math.max(1, val);
    updateMachinePendingEdit(selectedMachineId, {
      size: { ...activeMachine.size, y: clampedVal } as MachineSize,
    });
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
    <div className={styles['detail-pane']}>
      <div className={styles['editor-form']}>
        <div className={styles['form-header']}>
          <div className={styles['form-title']}>Machine Specification</div>
        </div>

        <div className={styles['form-body']}>
          {/* Read-Only unique machine ID */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Unique ID</label>
            <input
              type="text"
              className={styles['form-input-readonly']}
              value={activeMachine.id}
              disabled
              title="ID is generated automatically and cannot be changed"
            />
          </div>

          {/* Editable machine Name */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Machine Name</label>
            <input
              type="text"
              className={styles['form-input']}
              value={activeMachine.name || ''}
              onChange={handleNameChange}
              placeholder="e.g. Electric Furnace"
              maxLength={64}
            />
          </div>

          {/* Cost and Tier Row */}
          <div className={styles['form-row-grid']}>
            {/* Editable machine Cost */}
            <div className={styles['form-group']}>
              <label className={styles['form-label']}>Cost ($)</label>
              <input
                type="number"
                step="any"
                min="0.01"
                className={styles['form-input']}
                value={activeMachine.cost === undefined ? '' : activeMachine.cost}
                onChange={handleCostChange}
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
              <input
                type="number"
                step="1"
                min="1"
                className={styles['form-input']}
                value={activeMachine.size?.x === undefined ? '' : activeMachine.size.x}
                onChange={handleSizeXChange}
                placeholder="1"
                title="Must be a positive integer (>= 1)"
              />
            </div>

            {/* Size Y */}
            <div className={styles['form-group']}>
              <label className={styles['form-label']}>Size Y (Grid Units)</label>
              <input
                type="number"
                step="1"
                min="1"
                className={styles['form-input']}
                value={activeMachine.size?.y === undefined ? '' : activeMachine.size.y}
                onChange={handleSizeYChange}
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

          {/* Required Research SearchDropdown */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Required Research</label>
            <SearchDropdown
              value={activeMachine.research || ''}
              options={researchOptions}
              onChange={handleResearchChange}
              placeholder="Select Required Research..."
            />
          </div>

          {/* Action Row */}
          <div className={styles['form-actions']}>
            {isModified ? (
              <button
                className={styles['btn-restore-machine']}
                onClick={() => restoreMachineDefault(selectedMachineId)}
                title="Restore this entry back to its baseline default configuration"
              >
                <RotateCcw size={14} />
                Restore Baseline Defaults
              </button>
            ) : (
              <button className={styles['btn-delete-machine']} onClick={handleDelete}>
                <Trash2 size={14} />
                Delete Machine Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
