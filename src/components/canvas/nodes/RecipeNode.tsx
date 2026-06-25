import React, { useEffect, Suspense } from 'react';
import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { RecipeNodeType } from '../../../types/nodes';
import { getMachineName, getMachine, resolveActiveRecipe } from '../../../data/lookup';
import { RecipeNodeInfo } from './RecipeNodeInfo';
import { RecipeNodeIO } from './RecipeNodeIO';
import styles from './RecipeNode.module.css';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { LoadingScreen } from '../../shared/LoadingScreen';
import { overlayPrefetchCache, type NodeEditorProps } from '../overlayPrefetchCache';

const FallbackNodeEditor: React.ComponentType<NodeEditorProps> = () => null;

const LazyNodeEditor = React.lazy(
  () =>
    import('../../overlays/NodeEditor')
      .then((m) => {
        overlayPrefetchCache.NodeEditor = m.NodeEditor;
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

import { useDataStore } from '../../../stores/useDataStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { getSpecialRecipe } from '../../../data/registry';

export function RecipeNode({ id, data, height }: NodeProps<RecipeNodeType>) {
  const isEditorOpen = useUIStore((s) => s.nodeEditorOpenId === id);
  const setIsEditorOpen = (open: boolean) => {
    useUIStore.setState({ nodeEditorOpenId: open ? id : null });
  };
  const updateNodeInternals = useUpdateNodeInternals();
  const NodeEditor = overlayPrefetchCache.NodeEditor;

  const dbVersion = useDataStore((s) => s.dbVersion);

  const committedRecipe = useFlowResultStore((s) => s.nodeRecipes[id]);
  const liveRecipe =
    dbVersion !== -1 ? resolveActiveRecipe(data.recipeId, data.settings, id) : undefined;
  const flowResultGraphVersion = useFlowResultStore((s) => s.graphVersion);
  const flowResultDataDbVersion = useFlowResultStore((s) => s.dataDbVersion);
  const currentGraphVersion = useFlowStore((s) => s.graphVersion);
  const hasFreshSolveSnapshot =
    flowResultGraphVersion === currentGraphVersion &&
    flowResultDataDbVersion === dbVersion;
  const recipe = hasFreshSolveSnapshot
    ? committedRecipe ?? liveRecipe
    : liveRecipe ?? committedRecipe;

  const inputTempsMap = useFlowResultStore((s) => s.inputTemps[id]);
  let receivedTemp: number | null = null;

  if (recipe && typeof recipe.runtime?.boilerTemp === 'number') {
    receivedTemp = recipe.runtime.boilerTemp;
  } else if (recipe && typeof recipe.runtime?.hxTemp === 'number') {
    receivedTemp = recipe.runtime.hxTemp;
  } else {
    const sr = recipe ? getSpecialRecipe(recipe.id) : null;
    if (recipe && sr && sr.inputTemperatureSettings) {
      const tempInputIndices = Object.keys(sr.inputTemperatureSettings).map(Number);
      if (tempInputIndices.length > 0) {
        const firstIndex = tempInputIndices[0];
        const tempVal = inputTempsMap?.[firstIndex];
        if (typeof tempVal === 'number') {
          receivedTemp = tempVal;
        }
      }
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const frame = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    id,
    data.inputOrder,
    data.outputOrder,
    data.recipeId,
    displayHeight,
    updateNodeInternals,
  ]);

  return (
    <>
      <div
        className={styles['recipe-node']}
        style={{ '--node-height': `${displayHeight}px` } as React.CSSProperties}
        data-target={data.isTarget ? 'true' : undefined}
        data-multi-selected={data.isMultiSelected ? 'true' : undefined}
        data-tutorial-node-id={id}
      >
        <RecipeNodeInfo
          recipe={recipe}
          machineName={recipe ? getMachineName(recipe.machine_id) : '\u2014'}
          machineCount={data.machineCount}
          machineTier={recipe ? getMachine(recipe.machine_id)?.tier : 1}
          onOpenEditor={() => {
            useUIStore.setState({ activeToggleId: null });
            setIsEditorOpen(true);
          }}
          receivedTemp={receivedTemp}
          isTarget={!!data.isTarget}
          nodeId={id}
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
