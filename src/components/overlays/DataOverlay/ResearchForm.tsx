import { useState } from 'react';
import type { FormEvent } from 'react';
import { FlaskConical, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { getResearch, getAllResearches, hasResearchOverride } from '../../../data/lookup';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import { SearchDropdown } from '../../shared/SearchDropdown';
import type { Research } from '../../../types/data';
import { GenericDataFormShell } from './GenericDataFormShell';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import crudStyles from './DataCrud.module.css';
import styles from './ResearchesTab.module.css';

interface ResearchFormProps {
  selectedResearchId: string | null;
  onSelectResearch: (id: string | null) => void;
}

const CATEGORY_OPTIONS = [
  { value: 'Production', label: 'Production' },
  { value: 'Energy', label: 'Energy' },
  { value: 'Utility', label: 'Utility' },
];

export function ResearchForm({ selectedResearchId, onSelectResearch }: ResearchFormProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const updateResearchPendingEdit = useDataStore((s) => s.updateResearchPendingEdit);
  const deleteResearch = useDataStore((s) => s.deleteResearch);
  const restoreResearchDefault = useDataStore((s) => s.restoreResearchDefault);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const baseline = selectedResearchId ? getResearch(selectedResearchId) : undefined;
  const pending = selectedResearchId ? pendingEdits.researches[selectedResearchId] : undefined;
  const activeResearch = overlayPendingEdit(baseline, pending) as Research | undefined;
  const isModified = selectedResearchId
    ? dbVersion !== -1
      ? hasResearchOverride(selectedResearchId)
      : false
    : false;

  const [customPrereqText, setCustomPrereqText] = useState('');

  if (!selectedResearchId) {
    return (
      <div className={crudStyles['empty-detail']}>
        <FlaskConical size={48} className={crudStyles['empty-icon']} />
        <div className={crudStyles['empty-title']}>No Research Selected</div>
        <div className={crudStyles['empty-desc']}>
          Select a research node from the sidebar list to inspect or modify its attributes.
        </div>
      </div>
    );
  }

  if (pending?._tombstone) {
    return (
      <div className={crudStyles['empty-detail']}>
        <FlaskConical size={48} className={crudStyles['empty-icon']} />
        <div className={crudStyles['empty-title']}>Research Deleted</div>
        <div className={crudStyles['empty-desc']}>
          This research has been marked for deletion. Save changes to commit.
        </div>
      </div>
    );
  }

  if (!activeResearch) {
    return (
      <div className={crudStyles['empty-detail']}>
        <FlaskConical size={48} className={crudStyles['empty-icon']} />
        <div className={crudStyles['empty-title']}>Not Found</div>
        <div className={crudStyles['empty-desc']}>
          The requested research details could not be parsed.
        </div>
      </div>
    );
  }

  const handleNameChange = (name: string) => {
    const nextId = updateResearchPendingEdit(selectedResearchId, { name });
    if (nextId && nextId !== selectedResearchId) {
      onSelectResearch(nextId);
    }
  };

  const handleCategoryChange = (value: string) => {
    const nextId = updateResearchPendingEdit(selectedResearchId, { category: value });
    if (nextId && nextId !== selectedResearchId) {
      onSelectResearch(nextId);
    }
  };

  const currentPrereqs = activeResearch.prerequisites || [];

  const handleRemovePrereq = (prereqIdOrText: string) => {
    const updated = currentPrereqs.filter((p) => p !== prereqIdOrText);
    updateResearchPendingEdit(selectedResearchId, { prerequisites: updated });
  };

  const handleAddResearchPrereq = (prereqResearchId: string) => {
    if (!prereqResearchId) return;
    if (currentPrereqs.includes(prereqResearchId)) return;
    const updated = [...currentPrereqs, prereqResearchId];
    updateResearchPendingEdit(selectedResearchId, { prerequisites: updated });
  };

  const handleAddCustomPrereq = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = customPrereqText.trim();
    if (!text) return;
    if (currentPrereqs.includes(text)) return;
    const updated = [...currentPrereqs, text];
    updateResearchPendingEdit(selectedResearchId, { prerequisites: updated });
    setCustomPrereqText('');
  };

  const allResearches = getAllResearches();
  const searchDropdownOptions = allResearches
    .filter((r) => {
      const isNotSelf = r.id !== activeResearch.id;
      const isNotAlreadyPrereq = !currentPrereqs.includes(r.id);
      return isNotSelf && isNotAlreadyPrereq;
    })
    .map((r) => ({
      value: r.id,
      label: `${r.name} (${r.id})`,
    }));

  return (
    <GenericDataFormShell
      entityId={activeResearch.id}
      activeEntity={activeResearch}
      isModified={isModified}
      onNameChange={handleNameChange}
      onDelete={() => {
        deleteResearch(activeResearch.id);
        onSelectResearch(null);
      }}
      onRestore={async () => {
        await restoreResearchDefault(activeResearch.id);
      }}
      entityLabel="Research"
      EmptyIcon={FlaskConical}
    >
      <div className={crudStyles['form-group']}>
        <label className={crudStyles['form-label']}>RP Cost</label>
        <ValidatedNumberInput
          value={activeResearch.rp_cost}
          onChange={(val) => updateResearchPendingEdit(selectedResearchId, { rp_cost: val })}
          defaultValue={100}
          allowDecimals={false}
          allowNegatives={false}
          min={0}
          className={crudStyles['form-input']}
        />
      </div>

      <div className={crudStyles['form-group']}>
        <label className={crudStyles['form-label']}>Category</label>
        <select
          className={crudStyles['form-select']}
          value={activeResearch.category}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={crudStyles['form-group']}>
        <label className={crudStyles['form-label']}>Prerequisites</label>
        <div className={styles['prereqs-container']}>
          <div className={styles['prereqs-list']}>
            {currentPrereqs.length === 0 ? (
              <div className={styles['no-prereqs']}>No prerequisites added yet.</div>
            ) : (
              currentPrereqs.map((prereq) => {
                const isResearchPrereq = prereq.startsWith('s_');
                const matchedResearch = isResearchPrereq ? getResearch(prereq) : undefined;

                return (
                  <div key={prereq} className={styles['prereq-item']}>
                    <div className={styles['prereq-info']}>
                      {isResearchPrereq ? (
                        <>
                          <FlaskConical
                            size={12}
                            className={`${styles['prereq-icon']} ${styles['prereq-icon-flask']}`}
                          />
                          <span>
                            <strong>{matchedResearch ? matchedResearch.name : prereq}</strong>{' '}
                            (Research)
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckSquare size={12} className={styles['prereq-icon']} />
                          <span>{prereq}</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles['prereq-remove-btn']}
                      onClick={() => handleRemovePrereq(prereq)}
                      title="Remove prerequisite"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles['prereqs-add-controls']}>
            <div className={crudStyles['form-group']}>
              <span className={crudStyles['form-label-small']}>Add Research Prerequisite</span>
              <SearchDropdown
                value=""
                options={searchDropdownOptions}
                onChange={handleAddResearchPrereq}
                placeholder={
                  searchDropdownOptions.length === 0
                    ? 'No other researches in this category'
                    : 'Search & select research...'
                }
                disabled={searchDropdownOptions.length === 0}
              />
            </div>

            <div className={crudStyles['form-group']}>
              <span className={crudStyles['form-label-small']}>Add Custom Prerequisite</span>
              <form
                onSubmit={handleAddCustomPrereq}
                className={styles['custom-prereq-input-group']}
              >
                <input
                  type="text"
                  className={styles['custom-prereq-input']}
                  placeholder="e.g., Construct 5 Assemblers..."
                  value={customPrereqText}
                  onChange={(e) => setCustomPrereqText(e.target.value)}
                />
                <button type="submit" className={styles['btn-add-custom-prereq']}>
                  <Plus size={12} /> Add
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </GenericDataFormShell>
  );
}
