import type { Machine } from '../../../types/data';
import { SortableSelectorTable, type ColumnConfig } from '../../shared/SortableSelectorTable';
import { MACHINE_TABLE_VIEW_HEIGHT } from '../../shared/layoutConstants';
import { getAllMachines } from '../../../data/lookup';
import { getTaxonomyIcon } from '../../../utils/machineTaxonomy';
import { sortItems } from '../../../utils/sorting';
import useControlStore from '../../../stores/useControlStore';
import styles from './RecipeSelector.module.css';

const MACHINE_COLUMNS: ColumnConfig<Machine, 'name' | 'cost'>[] = [
  {
    field: 'name',
    label: 'Name',
    widthClass: 'col-70',
    renderCell: (m) => {
      const SubIcon = getTaxonomyIcon(m.category, m.subcategory);
      const tierClass = styles[`tier-${m.tier}`] || '';
      return (
        <div className={`${styles['cell-flex-container']} ${tierClass}`}>
          <span className={styles['tier-badge']}>T{m.tier}</span>
          <SubIcon size={14} className={styles['machine-subicon']} />
          <span className={styles['machine-name-text']}>{m.name}</span>
        </div>
      );
    },
  },
  {
    field: 'cost',
    label: 'Machine Cost',
    widthClass: 'col-30',
    renderCell: (m) => m.cost,
  },
];

export default function MachineTab() {
  const debouncedSearch = useControlStore((s) => s.selectorDebouncedSearch);
  const machineTierFilter = useControlStore((s) => s.selectorMachineTierFilter);
  const machineCategoryFilter = useControlStore((s) => s.selectorMachineCategoryFilter);
  const machineSubcategoryFilter = useControlStore((s) => s.selectorMachineSubcategoryFilter);
  const machineSortField = useControlStore((s) => s.selectorMachineSortField);
  const machineSortOrder = useControlStore((s) => s.selectorMachineSortOrder);

  const setMachineSortField = useControlStore((s) => s.setSelectorMachineSortField);
  const setMachineSortOrder = useControlStore((s) => s.setSelectorMachineSortOrder);

  const setStage = useControlStore((s) => s.setSelectorStage);
  const setSelectedId = useControlStore((s) => s.setSelectorSelectedId);
  const setFilterProducers = useControlStore((s) => s.setSelectorFilterProducers);
  const setFilterConsumers = useControlStore((s) => s.setSelectorFilterConsumers);

  const handleMachineSort = (field: 'name' | 'cost') => {
    if (machineSortField === field) {
      setMachineSortOrder(machineSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMachineSortField(field);
      setMachineSortOrder('asc');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setStage('recipes');
    setFilterProducers(true);
    setFilterConsumers(true);
  };

  let list = getAllMachines();

  if (debouncedSearch.trim()) {
    const q = debouncedSearch.toLowerCase().trim();
    list = list.filter((m) => m.name.toLowerCase().includes(q));
  }

  if (machineTierFilter !== 'All') {
    const tNum = parseInt(machineTierFilter, 10);
    list = list.filter((m) => m.tier === tNum);
  }

  if (machineCategoryFilter !== 'All') {
    list = list.filter((m) => m.category === machineCategoryFilter);
  }

  if (machineSubcategoryFilter !== 'All') {
    list = list.filter((m) => m.subcategory === machineSubcategoryFilter);
  }

  const filteredMachines = sortItems(list, machineSortField, machineSortOrder);

  return (
    <SortableSelectorTable
      items={filteredMachines}
      columns={MACHINE_COLUMNS}
      sortField={machineSortField}
      sortOrder={machineSortOrder}
      onSort={handleMachineSort}
      onSelectItem={handleSelectItem}
      emptyMessage="No machines match your criteria."
      height={MACHINE_TABLE_VIEW_HEIGHT}
    />
  );
}
export type { Machine };
