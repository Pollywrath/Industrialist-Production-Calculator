import React, { useState, useEffect, Suspense } from 'react';
import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { RecipeNodeType } from '../../../types/nodes';
import { resolveActiveRecipe, getMachineName } from '../../../data/lookup';
import { RecipeNodeInfo } from './RecipeNodeInfo';
import { RecipeNodeIO } from './RecipeNodeIO';
import styles from './RecipeNode.module.css';
import { useUIStore } from '../../../stores/useUIStore';
import { LoadingScreen } from '../../shared/LoadingScreen';
import { prefetchCache, type NodeEditorProps } from '../../../utils/prefetchCache';

const FallbackNodeEditor: React.ComponentType<NodeEditorProps> = () => null;

const LazyNodeEditor = React.lazy(
  () =>
    import('../../overlays/NodeEditor')
      .then((m) => {
        prefetchCache.NodeEditor = m.NodeEditor;
        return { default: m.NodeEditor };
      })
      .catch((err) => {
        console.warn('NodeEditor chunk load failed. Auto-refreshing application assets...', err);
        window.location.reload();
        return { default: FallbackNodeEditor };
      }) as Promise<{ default: React.ComponentType<NodeEditorProps> }>,
);

import {
  RECT_HEIGHT,
  RECT_GAP,
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
} from '../../shared/layoutConstants';

import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import { getSpecialRecipe } from '../../../data/registry';

export function RecipeNode({ id, data, height }: NodeProps<RecipeNodeType>) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const NodeEditor = prefetchCache.NodeEditor;

  // Reactively subscribe to dbVersion changes (database compile reloads)
  const dbVersion = useDataStore((s) => s.dbVersion);

  // Reactively subscribe to global settings changes (e.g. global pollution edits) ONLY if this node's recipe dynamically relies on them
  useGlobalSettingsStore((s) => {
    const isSpecial = !!getSpecialRecipe(data.recipeId);
    return isSpecial ? s.settings.global_pollution : null;
  });

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.inputOrder, data.outputOrder, updateNodeInternals]);

  // Bust React Compiler memoization by including dbVersion in the baseline lookup
  const recipe = dbVersion !== -1 ? resolveActiveRecipe(data.recipeId, data.settings) : undefined;

  const leftHandles = data.inputOrder
    ? data.inputOrder.map((idx) => ({ side: 'input' as const, index: idx }))
    : Array.from({ length: recipe?.inputs.length || 0 }, (_, i) => ({
        side: 'input' as const,
        index: i,
      }));

  const rightHandles = data.outputOrder
    ? data.outputOrder.map((idx) => ({ side: 'output' as const, index: idx }))
    : Array.from({ length: recipe?.outputs.length || 0 }, (_, i) => ({
        side: 'output' as const,
        index: i,
      }));

  const leftCount = leftHandles.length;
  const rightCount = rightHandles.length;
  const maxCount = Math.max(leftCount, rightCount, 1);

  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  const computedHeight = BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
  const displayHeight = height ?? computedHeight;

  return (
    <>
      <div
        className={styles['recipe-node']}
        style={{ '--node-height': `${displayHeight}px` } as React.CSSProperties}
      >
        <RecipeNodeInfo
          recipe={recipe}
          machineName={recipe ? getMachineName(recipe.machine_id) : '\u2014'}
          machineCount={data.machineCount}
          onOpenEditor={() => {
            useUIStore.setState({ activeToggleId: null });
            setIsEditorOpen(true);
          }}
        />
        <RecipeNodeIO
          leftHandles={leftHandles}
          rightHandles={rightHandles}
          recipe={recipe}
          nodeId={id}
          machineCount={data.machineCount}
        />
      </div>

      {isEditorOpen &&
        recipe &&
        (NodeEditor ? (
          React.createElement(NodeEditor, {
            recipe: recipe,
            initialData: data,
            nodeId: id,
            onClose: () => setIsEditorOpen(false),
          })
        ) : (
          <Suspense
            fallback={<LoadingScreen title="NODE PARAMETERS" subtitle="Loading node editor..." />}
          >
            <LazyNodeEditor
              recipe={recipe}
              initialData={data}
              nodeId={id}
              onClose={() => setIsEditorOpen(false)}
            />
          </Suspense>
        ))}
    </>
  );
}
