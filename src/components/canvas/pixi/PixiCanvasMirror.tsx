import { Application } from 'pixi.js';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { getCanvasAdapter } from '../../../canvas/canvasAdapterApi';
import {
  attachPixiCanvasAdapter,
  type PixiCanvasAdapterHandle,
} from '../../../canvas/pixiCanvasAdapter';
import type { Viewport } from '../../../canvas/pixiEngine';
import {
  clearCanvasThemeColorsCache,
  getCanvasThemeColors,
} from '../../../canvas/pixiEngine/theme/theme-colors';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useDataStore } from '../../../stores/useDataStore';
import { isGroupNode, isRecipeNode } from '../../../types/nodes';
import { resolveActiveRecipe } from '../../../data/lookup';
import { LoadingScreen } from '../../shared/LoadingScreen';
import { overlayPrefetchCache, type NodeEditorProps } from '../overlayPrefetchCache';
import { detectPixiWebGLSupport } from '../../../canvas/pixiCapabilities';
import styles from './PixiCanvasMirror.module.css';
import { PixiEdgeInfoPopupLayer } from './PixiEdgeInfoPopupLayer';

const FallbackNodeEditor: React.ComponentType<NodeEditorProps> = () => null;
const LazyNodeEditor = React.lazy(
  () =>
    import('../../overlays/NodeEditor')
      .then((module) => {
        overlayPrefetchCache.NodeEditor = module.NodeEditor;
        return { default: module.NodeEditor };
      })
      .catch((error: unknown) => {
        console.warn('NodeEditor chunk load failed. Auto-refreshing application assets...', error);
        window.location.reload();
        return { default: FallbackNodeEditor };
      }) as Promise<{ default: React.ComponentType<NodeEditorProps> }>,
);
const LazyGroupNodeEditor = React.lazy(() =>
  import('../../overlays/GroupNodeEditor').then((module) => ({ default: module.GroupNodeEditor })),
);

function PixiNodeEditorOverlay() {
  const nodeId = useUIStore((state) => state.nodeEditorOpenId);
  useDataStore((state) => state.dbVersion);
  const node = useFlowStore((state) => (nodeId ? state.nodesMap.get(nodeId) : undefined));
  const recipe = isRecipeNode(node)
    ? resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id)
    : undefined;
  const NodeEditor = overlayPrefetchCache.NodeEditor ?? LazyNodeEditor;
  if (nodeId && isGroupNode(node)) {
    return (
      <Suspense fallback={<LoadingScreen title="Group settings" subtitle="Loading settings…" />}>
        <LazyGroupNodeEditor
          initialData={node.data}
          nodeId={node.id}
          onClose={() => useUIStore.getState().setNodeEditorOpenId(null)}
        />
      </Suspense>
    );
  }
  if (!nodeId || !isRecipeNode(node) || !recipe) return null;
  return (
    <Suspense fallback={<LoadingScreen title="Recipe settings" subtitle="Loading settings…" />}>
      <NodeEditor
        recipe={recipe}
        initialData={node.data}
        nodeId={node.id}
        onClose={() => useUIStore.getState().setNodeEditorOpenId(null)}
      />
    </Suspense>
  );
}

interface PixiCanvasMirrorProps {
  onUnavailable(error: unknown): void;
  onBackendActive(): void;
  onBackendAvailability(available: boolean): void;
}

export function PixiCanvasMirror({
  onUnavailable,
  onBackendActive,
  onBackendAvailability,
}: PixiCanvasMirrorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<PixiCanvasAdapterHandle | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const fitViewRequestId = useUIStore((state) => state.fitViewRequestId);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;

    const initialize = async () => {
      let lastError: unknown = new Error('WebGL is not available for PixiJS rendering.');
      let webglAvailable = false;

      try {
        webglAvailable = await detectPixiWebGLSupport();
      } catch (error) {
        lastError = error;
      }

      onBackendAvailability(webglAvailable);

      if (disposed) return;

      if (!webglAvailable) {
        onUnavailable(lastError);
        return;
      }

      const candidate = new Application();

      try {
        clearCanvasThemeColorsCache();

        await candidate.init({
          antialias: true,
          autoDensity: true,
          autoStart: false,
          background: getCanvasThemeColors().canvasBackground,
          failIfMajorPerformanceCaveat: true,
          preference: ['webgl'],
          resolution: window.devicePixelRatio || 1,
          resizeTo: host,
        });

        if (disposed) {
          candidate.destroy({ removeView: true }, { children: true });
          return;
        }

        app = candidate;
        onBackendActive();

        adapterRef.current = attachPixiCanvasAdapter(
          candidate,
          host,
          (error) => {
            console.error('PixiJS canvas mirror could not be updated.', error);
            onUnavailable(error);
          },
          viewportRef.current ?? undefined,
        );
      } catch (error) {
        lastError = error;
        onBackendAvailability(false);

        try {
          candidate.destroy({ removeView: true }, { children: true });
        } catch (cleanupError) {
          console.warn('Failed to clean up an unavailable PixiJS renderer.', cleanupError);
        }

        if (!disposed) onUnavailable(lastError);
      }
    };

    void initialize();

    return () => {
      disposed = true;

      if (adapterRef.current) {
        viewportRef.current = adapterRef.current.camera.getState();
      }

      adapterRef.current?.destroy();
      adapterRef.current = null;
      app?.destroy({ removeView: true }, { children: true });
    };
  }, [onBackendActive, onBackendAvailability, onUnavailable, themeRevision]);

  useEffect(() => {
    if (fitViewRequestId === 0) return;
    getCanvasAdapter()?.fitGraph();
  }, [fitViewRequestId]);

  return (
    <>
      <div ref={hostRef} className={styles.host} aria-label="PixiJS canvas" />
      <PixiEdgeInfoPopupLayer />
      <PixiNodeEditorOverlay />
    </>
  );
}
