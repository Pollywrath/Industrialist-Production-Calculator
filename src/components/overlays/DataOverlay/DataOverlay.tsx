import { createPortal } from 'react-dom';
import {
  Database,
  X,
  Edit3,
  GitCompare,
  Package,
  Cpu,
  ClipboardList,
  FlaskConical,
  RotateCcw,
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { getDataOverrides } from '../../../persistence/idb';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../../stores/useTutorialStore';
import { ProductsTab } from './ProductsTab';
import { MachinesTab } from './MachinesTab';
import { RecipesTab } from './RecipesTab';
import { ResearchesTab } from './ResearchesTab';
import { DataComparatorTab } from './DataComparatorTab';
import styles from './DataOverlay.module.css';

export function DataOverlay() {
  const isDataOverlayOpen = useUIStore((s) => s.isDataOverlayOpen);

  if (!isDataOverlayOpen) return null;

  return <DataOverlayModal />;
}

function DataOverlayModal() {
  const setDataOverlayOpen = useUIStore((s) => s.setDataOverlayOpen);
  const activeMainTab = useDataStore((s) => s.dataOverlayMainTab);
  const activeEditTab = useDataStore((s) => s.dataOverlayEditTab);
  const setActiveMainTab = useDataStore((s) => s.setDataOverlayMainTab);
  const setActiveEditTab = useDataStore((s) => s.setDataOverlayEditTab);

  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const discardEdits = useDataStore((s) => s.discardEdits);
  const saveEdits = useDataStore((s) => s.saveEdits);
  const restoreDefaults = useDataStore((s) => s.restoreDefaults);

  const hasUnsavedEdits =
    Object.keys(pendingEdits.products).length > 0 ||
    Object.keys(pendingEdits.machines).length > 0 ||
    Object.keys(pendingEdits.recipes).length > 0 ||
    Object.keys(pendingEdits.researches).length > 0;

  const handleClose = () => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-close' })) return;
    setDataOverlayOpen(false);
    completeTutorialAction({ type: 'data-close' });
  };

  const handleMainTabClick = (tab: 'editing' | 'comparing') => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-main-tab', tab })) return;
    setActiveMainTab(tab);
    completeTutorialAction({ type: 'data-main-tab', tab });
  };

  const handleEditTabClick = (tab: 'products' | 'machines' | 'recipes' | 'researches') => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-edit-tab', tab })) return;
    setActiveEditTab(tab);
    completeTutorialAction({ type: 'data-edit-tab', tab });
  };

  const handleSaveEdits = async () => {
    if (!hasUnsavedEdits) return;
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-save' })) return;
    await saveEdits();
    const nextPending = useDataStore.getState().pendingEdits;
    const stillHasUnsavedEdits =
      Object.keys(nextPending.products).length > 0 ||
      Object.keys(nextPending.machines).length > 0 ||
      Object.keys(nextPending.recipes).length > 0 ||
      Object.keys(nextPending.researches).length > 0;
    if (!stillHasUnsavedEdits && isTutorialActive()) {
      const dataOverrides = await getDataOverrides();
      completeTutorialAction({ type: 'data-save', dataOverrides });
    }
  };

  const handleRestoreDefaults = async () => {
    if (isTutorialActive()) return;
    const tabNameMap = {
      products: 'Products',
      machines: 'Machines',
      recipes: 'Recipes',
      researches: 'Researches',
    };
    const activeLabel = tabNameMap[activeEditTab];

    const confirmed = await useUIStore.getState().confirm({
      title: `Restore ${activeLabel} Defaults`,
      message: `Are you sure you want to revert all custom ${activeLabel.toLowerCase()} overrides back to baseline defaults? This will erase all added, edited, or deleted ${activeLabel.toLowerCase()} entries permanently.`,
      confirmLabel: 'Restore Baseline',
      cancelLabel: 'Keep Custom Edits',
      intent: 'error',
    });
    if (confirmed) {
      await restoreDefaults(activeEditTab);
    }
  };

  return createPortal(
    <div className={styles['data-overlay']} onClick={handleClose}>
      <div className={styles['data-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['data-header']}>
          <div className={styles['data-title']}>
            <Database size={18} />
            <span>Data Manager</span>
          </div>
          <button className={styles['data-close']} onClick={handleClose} data-tutorial-data-close="true">
            <X size={18} />
          </button>
        </div>

        <div className={styles['data-tabs-main']}>
          <button
            className={`${styles['tab-btn-main']} ${
              activeMainTab === 'editing' ? styles['is-active'] : ''
            }`}
            onClick={() => handleMainTabClick('editing')}
            data-tutorial-data-main-tab="editing"
          >
            <Edit3 size={14} />
            <span>EDITING</span>
          </button>
          <button
            className={`${styles['tab-btn-main']} ${
              activeMainTab === 'comparing' ? styles['is-active'] : ''
            }`}
            onClick={() => handleMainTabClick('comparing')}
            data-tutorial-data-main-tab="comparing"
          >
            <GitCompare size={14} />
            <span>COMPARING</span>
          </button>
        </div>

        <div className={styles['data-content']}>
          {activeMainTab === 'comparing' ? (
            <DataComparatorTab />
          ) : (
            <div className={styles['edit-container']}>
              <div className={styles['data-tabs-sub']}>
                <button
                  className={`${styles['tab-btn-sub']} ${
                    activeEditTab === 'products' ? styles['is-active'] : ''
                  }`}
                  onClick={() => handleEditTabClick('products')}
                  data-tutorial-data-edit-tab="products"
                >
                  <Package size={13} />
                  <span>PRODUCTS</span>
                </button>
                <button
                  className={`${styles['tab-btn-sub']} ${
                    activeEditTab === 'machines' ? styles['is-active'] : ''
                  }`}
                  onClick={() => handleEditTabClick('machines')}
                  data-tutorial-data-edit-tab="machines"
                >
                  <Cpu size={13} />
                  <span>MACHINES</span>
                </button>
                <button
                  className={`${styles['tab-btn-sub']} ${
                    activeEditTab === 'recipes' ? styles['is-active'] : ''
                  }`}
                  onClick={() => handleEditTabClick('recipes')}
                  data-tutorial-data-edit-tab="recipes"
                >
                  <ClipboardList size={13} />
                  <span>RECIPES</span>
                </button>
                <button
                  className={`${styles['tab-btn-sub']} ${
                    activeEditTab === 'researches' ? styles['is-active'] : ''
                  }`}
                  onClick={() => handleEditTabClick('researches')}
                  data-tutorial-data-edit-tab="researches"
                >
                  <FlaskConical size={13} />
                  <span>RESEARCHES</span>
                </button>
              </div>

              <div className={styles['sub-tab-content']}>
                {activeEditTab === 'products' && <ProductsTab />}

                {activeEditTab === 'machines' && <MachinesTab />}
                {activeEditTab === 'recipes' && <RecipesTab />}
                {activeEditTab === 'researches' && <ResearchesTab />}
              </div>
            </div>
          )}
        </div>

        <div className={styles['data-footer']}>
          <div className={styles['footer-left']}>
            <button
              className={styles['btn-restore']}
              onClick={handleRestoreDefaults}
              title="Reset all database overrides to static baseline defaults"
            >
              <RotateCcw size={14} />
              <span>Restore Defaults</span>
            </button>
          </div>
          <div className={styles['footer-right']}>
            {hasUnsavedEdits && (
              <span className={styles['unsaved-label']}>[ UNSAVED DATA EDITS ]</span>
            )}
            <button
              className={`${styles['btn-discard']} ${
                !hasUnsavedEdits ? styles['is-disabled'] : ''
              }`}
              onClick={() => {
                if (isTutorialActive()) return;
                if (hasUnsavedEdits) discardEdits();
              }}
              disabled={!hasUnsavedEdits}
            >
              Discard
            </button>
            <button
              className={`${styles['btn-save']} ${!hasUnsavedEdits ? styles['is-disabled'] : ''}`}
              onClick={async () => {
                await handleSaveEdits();
              }}
              disabled={!hasUnsavedEdits}
              data-tutorial-data-save="changes"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
