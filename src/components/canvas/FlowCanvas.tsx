import React, { Suspense, useEffect } from 'react';
import { useUIStore, getEffectiveToggleId } from '../../stores/useUIStore';
import { ControlsTray } from '../menu/ControlsTray';
import { OverlaysTray } from '../menu/OverlaysTray';
import { DashboardPanels } from '../menu/DashboardPanels';
import { FlowViewport } from './FlowViewport';
import { LoadingScreen } from '../shared/LoadingScreen';
import { useAutosave } from '../../persistence/useAutosave';
import { prefetchCache } from '../../utils/prefetchCache';

import styles from './FlowCanvas.module.css';

const FallbackRecipeSelector: React.ComponentType<Record<string, never>> = () => null;
const FallbackSavesOverlay: React.ComponentType<Record<string, never>> = () => null;
const FallbackDataOverlay: React.ComponentType<Record<string, never>> = () => null;

const LazyRecipeSelector = React.lazy(
  () =>
    import('../overlays/RecipeSelector')
      .then((m) => {
        prefetchCache.RecipeSelector = m.RecipeSelector;
        return { default: m.RecipeSelector };
      })
      .catch((err) => {
        console.warn(
          'RecipeSelector chunk load failed. Auto-refreshing application assets...',
          err,
        );
        window.location.reload();
        return { default: FallbackRecipeSelector };
      }) as Promise<{ default: React.ComponentType<Record<string, never>> }>,
);

const LazySavesOverlay = React.lazy(
  () =>
    import('../overlays/SavesOverlay/SavesOverlay')
      .then((m) => {
        prefetchCache.SavesOverlay = m.SavesOverlay;
        return { default: m.SavesOverlay };
      })
      .catch((err) => {
        console.warn('SavesOverlay chunk load failed.', err);
        return { default: FallbackSavesOverlay };
      }) as Promise<{ default: React.ComponentType<Record<string, never>> }>,
);

const LazyDataOverlay = React.lazy(
  () =>
    import('../overlays/DataOverlay/DataOverlay')
      .then((m) => {
        prefetchCache.DataOverlay = m.DataOverlay;
        return { default: m.DataOverlay };
      })
      .catch((err) => {
        console.warn('DataOverlay chunk load failed.', err);
        return { default: FallbackDataOverlay };
      }) as Promise<{ default: React.ComponentType<Record<string, never>> }>,
);

export function FlowCanvas() {
  const isDeleteMode = useUIStore((s) => getEffectiveToggleId(s) === 'delete_mode');
  const isRecipeSelectorOpen = useUIStore((s) => s.isRecipeSelectorOpen);
  const isSavesOverlayOpen = useUIStore((s) => s.isSavesOverlayOpen);
  const isDataOverlayOpen = useUIStore((s) => s.isDataOverlayOpen);
  const isTransformingStore = useUIStore((s) => s.isTransforming);
  const zoomLevel = useUIStore((s) => s.zoomLevel);
  const isExporting = useUIStore((s) => s.isExporting);
  const isAutosaveLoaded = useUIStore((s) => s.isAutosaveLoaded);

  const isZoomedOut = !isExporting && zoomLevel < 0.35;
  const isTransforming = !isExporting && isTransformingStore;

  useAutosave();

  useEffect(() => {
    const hasIdle = typeof window.requestIdleCallback === 'function';
    let handle: number;

    const prefetch = () => {
      Promise.all([
        import('../overlays/RecipeSelector')
          .then((m) => {
            prefetchCache.RecipeSelector = m.RecipeSelector;
          })
          .catch((err) => {
            console.warn('Failed to prefetch RecipeSelector chunk on idle:', err);
          }),
        import('../overlays/NodeEditor')
          .then((m) => {
            prefetchCache.NodeEditor = m.NodeEditor;
          })
          .catch((err) => {
            console.warn('Failed to prefetch NodeEditor chunk on idle:', err);
          }),
        import('../overlays/SavesOverlay/SavesOverlay')
          .then((m) => {
            prefetchCache.SavesOverlay = m.SavesOverlay;
          })
          .catch((err) => {
            console.warn('Failed to prefetch SavesOverlay chunk on idle:', err);
          }),
        import('../overlays/DataOverlay/DataOverlay')
          .then((m) => {
            prefetchCache.DataOverlay = m.DataOverlay;
          })
          .catch((err) => {
            console.warn('Failed to prefetch DataOverlay chunk on idle:', err);
          }),
      ]);
    };

    if (hasIdle) {
      handle = window.requestIdleCallback(prefetch);
    } else {
      handle = window.setTimeout(prefetch, 1000);
    }

    return () => {
      if (hasIdle) {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, []);

  const RecipeSelector = prefetchCache.RecipeSelector;
  const SavesOverlay = prefetchCache.SavesOverlay;
  const DataOverlay = prefetchCache.DataOverlay;

  if (!isAutosaveLoaded) {
    return (
      <div className={styles['canvas-container']}>
        <LoadingScreen
          title="INDUSTRIALIST CALCULATOR"
          subtitle="Restoring previous session layout..."
        />
      </div>
    );
  }

  const containerClassName = [
    styles['canvas-container'],
    isDeleteMode ? 'is-delete-mode' : '',
    isTransforming ? 'is-transforming' : '',
    isZoomedOut ? 'is-zoomed-out' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName}>
      <FlowViewport />
      <ControlsTray />
      <OverlaysTray />
      <DashboardPanels />
      {isRecipeSelectorOpen &&
        (RecipeSelector ? (
          React.createElement(RecipeSelector)
        ) : (
          <Suspense
            fallback={
              <LoadingScreen title="RECIPE SELECTOR" subtitle="Loading recipe database..." />
            }
          >
            <LazyRecipeSelector />
          </Suspense>
        ))}
      {isSavesOverlayOpen &&
        (SavesOverlay ? (
          React.createElement(SavesOverlay)
        ) : (
          <Suspense
            fallback={<LoadingScreen title="SAVE MANAGER" subtitle="Loading storage database..." />}
          >
            <LazySavesOverlay />
          </Suspense>
        ))}
      {isDataOverlayOpen &&
        (DataOverlay ? (
          React.createElement(DataOverlay)
        ) : (
          <Suspense
            fallback={<LoadingScreen title="DATA MANAGER" subtitle="Loading data editor..." />}
          >
            <LazyDataOverlay />
          </Suspense>
        ))}
    </div>
  );
}
