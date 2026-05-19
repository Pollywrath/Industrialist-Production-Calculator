import { GenericDataList } from './GenericDataList';
import styles from './MachinesTab.module.css';

interface MachinesListProps {
  selectedMachineId: string | null;
  onSelectMachine: (id: string | null) => void;
}

export function MachinesList({ selectedMachineId, onSelectMachine }: MachinesListProps) {
  return (
    <GenericDataList
      type="machine"
      selectedId={selectedMachineId}
      onSelect={onSelectMachine}
      styles={styles}
    />
  );
}
