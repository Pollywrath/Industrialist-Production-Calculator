import { useState } from 'react';
import { MachinesList } from './MachinesList';
import { MachineForm } from './MachineForm';
import styles from './MachinesTab.module.css';

export function MachinesTab() {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  return (
    <div className={styles['machines-tab-container']}>
      <MachinesList
        selectedMachineId={selectedMachineId}
        onSelectMachine={setSelectedMachineId}
      />
      <MachineForm
        selectedMachineId={selectedMachineId}
        onSelectMachine={setSelectedMachineId}
      />
    </div>
  );
}
