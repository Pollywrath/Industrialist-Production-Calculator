import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import type { RecipeNodeType } from '../../../types/nodes';
import { getRecipe, getMachineName } from '../../../data/lookup';
import RecipeNodeInfo from './RecipeNodeInfo';
import RecipeNodeIO from './RecipeNodeIO';
import styles from './RecipeNode.module.css';
import { useState, useEffect } from 'react';
import NodeEditor from '../../overlays/NodeEditor';

import {
  RECT_HEIGHT,
  RECT_GAP,
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
} from './layoutConstants';

export default function RecipeNode({ id, data }: NodeProps<RecipeNodeType>) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.inputOrder, data.outputOrder, updateNodeInternals]);

  const recipe = getRecipe(data.recipeId);

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
  const height = BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;

  return (
    <>
      <div className={styles['recipe-node']} style={{ height }}>
        <RecipeNodeInfo
          recipe={recipe}
          machineName={recipe ? getMachineName(recipe.machine_id) : '—'}
          machineCount={data.machineCount}
          customName={data.customName}
          onOpenEditor={() => setIsEditorOpen(true)}
        />
        <RecipeNodeIO
          leftHandles={leftHandles}
          rightHandles={rightHandles}
          recipe={recipe}
          nodeId={id}
          machineCount={data.machineCount}
        />
      </div>

      {isEditorOpen && recipe && (
        <NodeEditor
          recipe={recipe}
          initialData={data}
          nodeId={id}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
    </>
  );
}
