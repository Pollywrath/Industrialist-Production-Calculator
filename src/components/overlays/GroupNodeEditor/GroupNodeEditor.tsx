import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { Edge } from '@xyflow/react';
import type { GroupNodeData, RecipeNodeType } from '../../../types/nodes';
import { isRecipeNode } from '../../../types/nodes';
import type { RateMode } from '../../../types/ui';
import { getProductName, resolveActiveRecipe } from '../../../data/lookup';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { useUIStore } from '../../../stores/useUIStore';
import { createGraphResolutionContext } from '../../../utils/graphResolutionContext';
import { parseHandleId } from '../../../utils/idGenerator';
import { cleanFlow, getRateMultiplier, toPlainString } from '../../../utils/recipeComputation';
import styles from '../NodeEditor/NodeEditor.module.css';

interface GroupNodeEditorProps {
  initialData: GroupNodeData;
  nodeId: string;
  onClose: () => void;
}

interface ProxyHandleItem {
  handleId: string;
  label: string;
  quantity: string;
  isStale: boolean;
}

const getRateSuffix = (rateMode: RateMode) => {
  switch (rateMode) {
    case 'second':
      return '/s';
    case 'minute':
      return '/m';
    case 'hour':
      return '/h';
    case 'raw':
    default:
      return '';
  }
};

function moveItem(items: string[], index: number, delta: number): string[] {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return items;

  const nextItems = items.slice();
  const item = nextItems[index];
  nextItems[index] = nextItems[nextIndex];
  nextItems[nextIndex] = item;
  return nextItems;
}

function buildProxyItems(
  handleIds: string[],
  side: 'input' | 'output',
  recipeNodes: RecipeNodeType[],
  edges: Edge[],
  rateMode: RateMode,
  resolvedProducts: Record<string, string>,
): ProxyHandleItem[] {
  const recipeNodeIds = new Set<string>();
  for (let i = 0; i < recipeNodes.length; i++) {
    recipeNodeIds.add(recipeNodes[i].id);
  }

  const recipeEdges = edges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );
  const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);
  const nodesMap = new Map<string, RecipeNodeType>();
  for (let i = 0; i < recipeNodes.length; i++) {
    nodesMap.set(recipeNodes[i].id, recipeNodes[i]);
  }

  const items = new Array<ProxyHandleItem>(handleIds.length);
  for (let i = 0; i < handleIds.length; i++) {
    const handleId = handleIds[i];
    const parsed = parseHandleId(handleId);
    if (!parsed || parsed.side !== side) {
      items[i] = {
        handleId,
        label: 'Stale / Invalid Handle',
        quantity: 'N/A',
        isStale: true,
      };
      continue;
    }

    const node = nodesMap.get(parsed.nodeId);
    if (!node) {
      items[i] = {
        handleId,
        label: 'Stale / Invalid Handle',
        quantity: 'N/A',
        isStale: true,
      };
      continue;
    }

    const helpers = resolutionContext.createHelpers(node.id);
    const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id, helpers);
    const entry = side === 'input' ? recipe?.inputs[parsed.index] : recipe?.outputs[parsed.index];
    if (!recipe || !entry) {
      items[i] = {
        handleId,
        label: 'Stale / Invalid Handle',
        quantity: 'N/A',
        isStale: true,
      };
      continue;
    }

    const productId = resolvedProducts[handleId] ?? helpers.resolveProduct(side, parsed.index);
    const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);
    const scale = entry.independentOfMachineCount ? 1 : node.data.machineCount;
    const rate = entry.quantity * multiplier * scale;
    items[i] = {
      handleId,
      label: getProductName(productId),
      quantity: toPlainString(cleanFlow(rate), 8),
      isStale: false,
    };
  }

  return items;
}

interface ProxyHandleColumnProps {
  items: ProxyHandleItem[];
  side: 'input' | 'output';
  rateMode: RateMode;
  onMove: (index: number, delta: number) => void;
}

function ProxyHandleColumn({ items, side, rateMode, onMove }: ProxyHandleColumnProps) {
  return (
    <div className={styles['node-editor-column']}>
      <h3>{side === 'input' ? 'Input Proxies' : 'Output Proxies'}</h3>
      <div className={styles['node-editor-list']}>
        {items.map((item, index) => (
          <div
            key={item.handleId}
            className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}
          >
            <div className={styles['node-editor-actions']}>
              <div className={styles['node-editor-actions-stack']}>
                <button disabled={index === 0} onClick={() => onMove(index, -1)}>
                  <ChevronUp size={14} />
                </button>
                <button disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <div
              className={`${styles['node-editor-handle-label']} ${
                item.isStale ? styles['is-stale'] : ''
              }`}
            >
              <span className={styles['node-editor-handle-name']}>{item.label}</span>
            </div>
            <div className={styles['node-editor-quantity-section']}>
              <span className={styles['node-editor-quantity-neutral']}>{item.quantity}</span>
              {!item.isStale && (
                <span className={styles['node-editor-quantity-unit']}>
                  {getRateSuffix(rateMode)}
                </span>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
      </div>
    </div>
  );
}

export function GroupNodeEditor({ initialData, nodeId, onClose }: GroupNodeEditorProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const resolvedProducts = useFlowResultStore((s) => s.resolvedProducts);
  const { nodes, edges, updateGroupNodeData } = useFlowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      updateGroupNodeData: s.updateGroupNodeData,
    })),
  );
  const [label, setLabel] = useState(initialData.label);
  const [inputProxyHandleIds, setInputProxyHandleIds] = useState(
    initialData.inputProxyHandleIds,
  );
  const [outputProxyHandleIds, setOutputProxyHandleIds] = useState(
    initialData.outputProxyHandleIds,
  );

  const recipeNodes = nodes.filter(isRecipeNode);
  const inputItems = initialData.collapsed
    ? buildProxyItems(inputProxyHandleIds, 'input', recipeNodes, edges, rateMode, resolvedProducts)
    : [];
  const outputItems = initialData.collapsed
    ? buildProxyItems(
        outputProxyHandleIds,
        'output',
        recipeNodes,
        edges,
        rateMode,
        resolvedProducts,
      )
    : [];

  const handleApply = () => {
    updateGroupNodeData(nodeId, {
      label: label.trim() || 'Group',
      ...(initialData.collapsed
        ? {
            inputProxyHandleIds,
            outputProxyHandleIds,
          }
        : {}),
    });
    onClose();
  };

  return createPortal(
    <div className={styles['node-editor-overlay']} onClick={onClose}>
      <div className={styles['node-editor-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['node-editor-header']}>
          <h2 id="group-node-editor-dialog-title">Group Node Editor</h2>
          <div className={styles['node-editor-header-actions']}>
            <button className={styles['node-editor-btn-icon']} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles['node-editor-content']}>
          <div className={styles['node-editor-group']}>
            <label>Group Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={styles['node-editor-input']}
            />
          </div>

          {initialData.collapsed && (
            <div className={styles['node-editor-columns']}>
              <ProxyHandleColumn
                items={inputItems}
                side="input"
                rateMode={rateMode}
                onMove={(index, delta) =>
                  setInputProxyHandleIds((items) => moveItem(items, index, delta))
                }
              />
              <ProxyHandleColumn
                items={outputItems}
                side="output"
                rateMode={rateMode}
                onMove={(index, delta) =>
                  setOutputProxyHandleIds((items) => moveItem(items, index, delta))
                }
              />
            </div>
          )}
        </div>

        <div className={styles['node-editor-footer']}>
          <button className={styles['node-editor-btn-secondary']} onClick={onClose}>
            Cancel
          </button>
          <button className={styles['node-editor-btn-primary']} onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
