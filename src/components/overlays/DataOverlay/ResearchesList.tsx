import { GenericDataList } from './GenericDataList';
import styles from './ResearchesTab.module.css';

interface ResearchesListProps {
  selectedResearchId: string | null;
  onSelectResearch: (id: string | null) => void;
}

export function ResearchesList({ selectedResearchId, onSelectResearch }: ResearchesListProps) {
  return (
    <GenericDataList
      type="research"
      selectedId={selectedResearchId}
      onSelect={onSelectResearch}
      styles={styles}
    />
  );
}
