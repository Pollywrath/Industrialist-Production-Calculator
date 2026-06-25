import { useDataStore } from '../../../stores/useDataStore';
import { ResearchesList } from './ResearchesList';
import { ResearchForm } from './ResearchForm';
import styles from './ResearchesTab.module.css';

export function ResearchesTab() {
  const selectedResearchId = useDataStore((s) => s.selectedResearchId);
  const setSelectedResearchId = useDataStore((s) => s.setSelectedResearchId);

  return (
    <div className={styles['researches-tab-container']}>
      <ResearchesList
        selectedResearchId={selectedResearchId}
        onSelectResearch={setSelectedResearchId}
      />
      <ResearchForm
        selectedResearchId={selectedResearchId}
        onSelectResearch={setSelectedResearchId}
      />
    </div>
  );
}
