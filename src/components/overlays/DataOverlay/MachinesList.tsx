import { Search, Plus, X } from 'lucide-react';
import { VirtualList } from '../../shared/VirtualList';
import { getAllMachines, hasMachineOverride } from '../../../data/lookup';
import type { Machine } from '../../../types/data';
import { useDataStore } from '../../../stores/useDataStore';
import styles from './MachinesTab.module.css';

interface MachinesListProps {
  selectedMachineId: string | null;
  onSelectMachine: (id: string | null) => void;
}

export function MachinesList({ selectedMachineId, onSelectMachine }: MachinesListProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const searchQuery = useDataStore((s) => s.searchQuery);
  const setSearchQuery = useDataStore((s) => s.setSearchQuery);
  const addMachine = useDataStore((s) => s.addMachine);
  const dbVersion = useDataStore((s) => s.dbVersion);

  // 1. Gather baseline static machines and apply transient merges
  // Bust React Compiler memoization by including dbVersion in the baseline lookup
  const baseline = dbVersion !== -1 ? getAllMachines() : [];
  const compiledMachines: Machine[] = baseline
    .map((m) => {
      const pending = pendingEdits.machines[m.id];
      if (pending) {
        if (pending._tombstone) return null;
        return { ...m, ...pending } as Machine;
      }
      return m;
    })
    .filter((m): m is Machine => m !== null);

  // Append newly created unsaved machines
  const newMachines = Object.values(pendingEdits.machines).filter(
    (m) => m._isNew && !m._tombstone
  ) as Machine[];
  compiledMachines.push(...newMachines);

  // 2. Apply search text query filtering
  const query = searchQuery.toLowerCase().trim();
  const filteredMachines = compiledMachines.filter((m) => {
    if (!query) return true;
    return m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query);
  });

  // Sort alphabetically by ID
  filteredMachines.sort((a, b) => a.id.localeCompare(b.id));

  // 3. Trigger adding a new entry
  const handleAddNewMachine = () => {
    const newId = addMachine('New Machine');
    onSelectMachine(newId);
  };

  return (
    <div className={styles['sidebar-pane']}>
      {/* Search and Add Toolbar */}
      <div className={styles['sidebar-toolbar']}>
        <div className={styles['search-box']}>
          <Search className={styles['search-icon']} size={14} />
          <input
            type="text"
            className={styles['search-input']}
            placeholder="Search machines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles['search-clear']}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={styles['btn-add-machine']}
          onClick={handleAddNewMachine}
          title="Add Custom Machine"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Virtual Scrollable List Container */}
      <div className={styles['list-viewport']}>
        <VirtualList
          items={filteredMachines}
          itemHeight={44}
          height={500} // Physical sidebar viewport height limit
          getKey={(m) => m.id}
        >
          {(machine) => {
            const isSelected = selectedMachineId === machine.id;
            const isNew = pendingEdits.machines[machine.id]?._isNew;
            const isModified = dbVersion !== -1 ? hasMachineOverride(machine.id) : false;

            return (
              <div
                className={`${styles['list-item']} ${isSelected ? styles['is-selected'] : ''}`}
                data-new={isNew ? 'true' : undefined}
                data-modified={isModified ? 'true' : undefined}
                onClick={() => onSelectMachine(machine.id)}
              >
                <div className={styles['item-row-header']}>
                  <div className={styles['item-name']}>{machine.name}</div>
                  {isNew && <span className={styles['badge-new']}>New</span>}
                  {isModified && <span className={styles['badge-modified']}>Edited</span>}
                </div>
                <div className={styles['item-meta']}>
                  <div className={styles['item-id']}>{machine.id}</div>
                </div>
              </div>
            );
          }}
        </VirtualList>
      </div>
    </div>
  );
}
