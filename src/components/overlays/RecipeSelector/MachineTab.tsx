import type { Machine } from '../../../types/data';
import {
  Droplet,
  Pickaxe,
  Component,
  Flame,
  Wrench,
  Layers,
  Container,
  Cpu,
  Filter,
  GitFork,
  Binary,
  LogIn,
  LogOut,
  Settings,
  Paintbrush,
  Warehouse,
  HelpCircle,
  FlaskConical,
  Gauge,
  Fan,
  Trees,
  Battery,
  Factory,
  Calculator,
  Leaf,
  Cable,
  Package,
  Fuel,
} from 'lucide-react';
import VirtualList from '../../shared/VirtualList';
import styles from './RecipeSelector.module.css';

interface MachineTabProps {
  filteredMachines: Machine[];
  machineSortField: 'name' | 'cost';
  machineSortOrder: 'asc' | 'desc';
  onMachineSort: (field: 'name' | 'cost') => void;
  onSelectItem: (id: string) => void;
}

function SortIndicator({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  return (
    <span className={styles['sort-indicator']}>
      <span
        className={`${styles['sort-arrow']} ${active && order === 'asc' ? styles['is-active'] : ''}`}
      >
        ▲
      </span>
      <span
        className={`${styles['sort-arrow']} ${active && order === 'desc' ? styles['is-active'] : ''}`}
      >
        ▼
      </span>
    </span>
  );
}

const SUBCATEGORY_ICONS: Record<string, typeof HelpCircle> = {
  'fluid extractor': Droplet,
  'item extractor': Pickaxe,
  assembler: Component,
  furnace: Flame,
  molder: Layers,
  plant: Container,
  processor: Cpu,
  refinery: Filter,
  separator: GitFork,
  'logic gate': Binary,
  'logic input': LogIn,
  'logic output': LogOut,
  decoration: Paintbrush,
  depot: Warehouse,
  other: HelpCircle,
  research: FlaskConical,
  'modular diesel engine': Gauge,
  'modular turbine': Fan,
  'tree farm': Trees,
  battery: Battery,
  'large power plant': Factory,
  'non-renewable': Fuel,
  'power rate calculator': Calculator,
  renewable: Leaf,
  'fluid silo': Droplet,
  'item silo': Package,
};

const CATEGORY_FALLBACKS: Record<string, typeof HelpCircle> = {
  power: Cable,
  factory: Component,
  logic: Binary,
  extractor: Pickaxe,
};

function getSubcategoryIcon(category: string, subcategory: string) {
  const cat = (category || '').toLowerCase().trim();
  const sub = (subcategory || '').toLowerCase().trim();

  if (sub === 'misc') {
    if (cat === 'factory') return Wrench;
    if (cat === 'power') return Settings;
  }
  if (sub === 'miscellaneous' && cat === 'logic') return Settings;
  if (sub === 'transfer pole' || sub === 'transferpole') return Cable;

  if (sub in SUBCATEGORY_ICONS) {
    return SUBCATEGORY_ICONS[sub];
  }

  if (cat in CATEGORY_FALLBACKS) {
    return CATEGORY_FALLBACKS[cat];
  }

  return HelpCircle;
}

export default function MachineTab({
  filteredMachines,
  machineSortField,
  machineSortOrder,
  onMachineSort,
  onSelectItem,
}: MachineTabProps) {
  return (
    <>
      <div className={styles['recipe-selector-table-header-wrapper']}>
        <table className={`${styles['recipe-selector-table']} ${styles['fixed-table']}`}>
          <thead>
            <tr>
              <th
                className={`${styles['sortable-header']} ${styles['text-center']} ${styles['col-70']}`}
                onClick={() => onMachineSort('name')}
              >
                Name <SortIndicator active={machineSortField === 'name'} order={machineSortOrder} />
              </th>
              <th
                className={`${styles['sortable-header']} ${styles['text-center']} ${styles['col-30']}`}
                onClick={() => onMachineSort('cost')}
              >
                Machine Cost{' '}
                <SortIndicator active={machineSortField === 'cost'} order={machineSortOrder} />
              </th>
            </tr>
          </thead>
        </table>
      </div>
      {filteredMachines.length === 0 ? (
        <div className={styles['table-empty']}>No machines match your criteria.</div>
      ) : (
        <VirtualList items={filteredMachines} itemHeight={45} height={430} overscan={5}>
          {(m) => {
            const SubIcon = getSubcategoryIcon(m.category, m.subcategory);
            const tierClass = styles[`tier-${m.tier}`] || '';
            return (
              <table className={`${styles['recipe-selector-table']} ${styles['fixed-table']}`}>
                <tbody>
                  <tr onClick={() => onSelectItem(m.id)} className={styles['clickable-row']}>
                    <td className={styles['col-70']}>
                      <div className={`${styles['cell-flex-container']} ${tierClass}`}>
                        <span className={styles['tier-badge']}>T{m.tier}</span>
                        <SubIcon size={14} className={styles['machine-subicon']} />
                        <span className={styles['machine-name-text']}>{m.name}</span>
                      </div>
                    </td>
                    <td className={`${styles['text-center']} ${styles['col-30']}`}>{m.cost}</td>
                  </tr>
                </tbody>
              </table>
            );
          }}
        </VirtualList>
      )}
    </>
  );
}
