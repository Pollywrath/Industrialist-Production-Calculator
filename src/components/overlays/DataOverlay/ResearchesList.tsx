import { GenericDataList } from './GenericDataList';

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
    />
  );
}
