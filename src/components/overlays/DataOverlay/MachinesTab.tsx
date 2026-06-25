import { useDataStore } from '../../../stores/useDataStore';
import { MachinesList } from './MachinesList';
import { MachineForm } from './MachineForm';
import styles from './MachinesTab.module.css';

export function MachinesTab() {
  const selectedMachineId = useDataStore((s) => s.selectedMachineId);
  const setSelectedMachineId = useDataStore((s) => s.setSelectedMachineId);

  return (
    <div className={styles['machines-tab-container']}>
      <MachinesList selectedMachineId={selectedMachineId} onSelectMachine={setSelectedMachineId} />
      <MachineForm selectedMachineId={selectedMachineId} onSelectMachine={setSelectedMachineId} />
    </div>
  );
}
