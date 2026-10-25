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
import { detectPixiBackendCapabilities } from '../../../canvas/pixiCapabilities';
import {
  getAvailablePixiBackends,
  type CanvasRendererPreference,
} from '../../../stores/useCanvasRendererStore';
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
  preference: Exclude<CanvasRendererPreference, 'react-flow'>;
  onUnavailable(error: unknown): void;
  onBackendActive(backend: 'webgpu' | 'webgl'): void;
  onBackendAvailability(backend: 'webgpu' | 'webgl', available: boolean): void;
}

export function PixiCanvasMirror({
  preference,
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
      let lastError: unknown = new Error('No supported PixiJS rendering backend is available.');
      let capabilities = { webgpu: false, webgl: false };
      try {
        capabilities = await detectPixiBackendCapabilities();
      } catch (error) {
        lastError = error;
      }
      onBackendAvailability('webgpu', capabilities.webgpu);
      onBackendAvailability('webgl', capabilities.webgl);

      for (const backend of getAvailablePixiBackends(preference, capabilities)) {
        if (disposed) return;

        const candidate = new Application();
        try {
          clearCanvasThemeColorsCache();
          await candidate.init({
            antialias: true,
            autoDensity: true,
            autoStart: false,
            background: getCanvasThemeColors().canvasBackground,
            failIfMajorPerformanceCaveat: backend === 'webgl',
            preference: [backend],
            resolution: window.devicePixelRatio || 1,
            resizeTo: host,
          });
          if (disposed) {
            candidate.destroy({ removeView: true }, { children: true });
            return;
          }
          app = candidate;
          onBackendActive(backend);
          adapterRef.current = attachPixiCanvasAdapter(
            candidate,
            host,
            (error) => {
              console.error('PixiJS canvas mirror could not be updated.', error);
              onUnavailable(error);
            },
            viewportRef.current ?? undefined,
          );
          return;
        } catch (error) {
          lastError = error;
          onBackendAvailability(backend, false);
          try {
            candidate.destroy({ removeView: true }, { children: true });
          } catch (cleanupError) {
            console.warn('Failed to clean up an unavailable PixiJS renderer.', cleanupError);
          }
        }
      }
      console.warn('PixiJS could not initialize either supported GPU backend.', lastError);
      if (!disposed) onUnavailable(lastError);
    };

    void initialize();

    return () => {
      disposed = true;
      if (adapterRef.current) viewportRef.current = adapterRef.current.camera.getState();
      adapterRef.current?.destroy();
      adapterRef.current = null;
      app?.destroy({ removeView: true }, { children: true });
    };
  }, [onBackendActive, onBackendAvailability, onUnavailable, preference, themeRevision]);

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
