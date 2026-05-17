import React, { useState, useEffect, Suspense } from 'react';
import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { RecipeNodeType } from '../../../types/nodes';
import { getRecipe, getMachineName } from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
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

export function RecipeNode({ id, data, height }: NodeProps<RecipeNodeType>) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const NodeEditor = prefetchCache.NodeEditor;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.inputOrder, data.outputOrder, updateNodeInternals]);

  let recipe = getRecipe(data.recipeId);
  if (recipe) {
    const sr = getSpecialRecipe(recipe.id);
    if (sr && data.settings) {
      const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;
      recipe = sr.compute(data.settings, globalSettings);
    }
  }

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
      <div className={styles['recipe-node']} style={{ height: displayHeight }}>
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
