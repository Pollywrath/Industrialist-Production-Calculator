import { useState } from 'react';
import { ResearchesList } from './ResearchesList';
import { ResearchForm } from './ResearchForm';
import styles from './ResearchesTab.module.css';

export function ResearchesTab() {
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);

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
