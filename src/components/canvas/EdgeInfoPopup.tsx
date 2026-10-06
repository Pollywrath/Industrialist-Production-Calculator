import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  getMachine,
  getMachineName,
  getProductName,
  getRecipe,
  resolveActiveRecipe,
} from '../../data/lookup';
import { useDataStore } from '../../stores/useDataStore';
import { useFlowResultStore } from '../../stores/useFlowResultStore';
import { useFlowStore } from '../../stores/useFlowStore';
import { useUIStore } from '../../stores/useUIStore';
import { getNormalizedCycleTime } from '../../utils/recipeComputation';
import { getRecipeEntryProductId } from '../../utils/handleTypes';
import { buildHandleId, parseHandleId } from '../../utils/idGenerator';
import { getRateSuffix } from '../../utils/rateFormatting';
import { formatQuantity } from '../../utils/unitFormatting';
import { isGroupNode, isRecipeNode, type CanvasNode, type RecipeNodeType } from '../../types/nodes';
import styles from './EdgeInfoPopup.module.css';

interface EdgeInfoPopupProps {
  edgeId: string;
  anchorX: number;
  anchorY: number;
  onDismiss: () => void;
}

interface ResolvedEdgeEndpoint {
  node: RecipeNodeType;
  portIndex: number;
}

function resolveRecipeEndpoint(
  nodesMap: Map<string, CanvasNode>,
  endpointId: string,
  handleId: string | null | undefined,
  side: 'input' | 'output',
): ResolvedEdgeEndpoint | null {
  const endpointNode = nodesMap.get(endpointId);
  const parsedHandle = handleId ? parseHandleId(handleId) : null;
  if (!parsedHandle || parsedHandle.side !== side) return null;

  if (endpointNode && isGroupNode(endpointNode)) {
    const proxyHandles =
      side === 'output'
        ? endpointNode.data.outputProxyHandleIds
        : endpointNode.data.inputProxyHandleIds;
    const underlyingHandle = proxyHandles[parsedHandle.index];
    const parsedUnderlyingHandle = underlyingHandle ? parseHandleId(underlyingHandle) : null;
    if (!parsedUnderlyingHandle || parsedUnderlyingHandle.side !== side) return null;

    const node = nodesMap.get(parsedUnderlyingHandle.nodeId);
    return isRecipeNode(node) ? { node, portIndex: parsedUnderlyingHandle.index } : null;
  }

  const node = nodesMap.get(parsedHandle.nodeId) ?? endpointNode;
  return isRecipeNode(node) ? { node, portIndex: parsedHandle.index } : null;
}

function getTierColor(tier: number | undefined): string {
  const tierName = tier != null && tier >= 1 && tier <= 5 ? `tier-${tier}` : 'tier-default';
  return `var(--theme-color-${tierName})`;
}

export function EdgeInfoPopup({ edgeId, anchorX, anchorY, onDismiss }: EdgeInfoPopupProps) {
  const edge = useFlowStore((state) => state.edges.find((item) => item.id === edgeId));
  const nodesMap = useFlowStore((state) => state.nodesMap);
  const graphVersion = useFlowStore((state) => state.graphVersion);
  const edgeFlows = useFlowResultStore((state) => state.edgeFlows);
  const resolvedProducts = useFlowResultStore((state) => state.resolvedProducts);
  const nodeRecipes = useFlowResultStore((state) => state.nodeRecipes);
  const resultGraphVersion = useFlowResultStore((state) => state.graphVersion);
  const resultDataDbVersion = useFlowResultStore((state) => state.dataDbVersion);
  const dataDbVersion = useDataStore((state) => state.dbVersion);
  const rateMode = useUIStore((state) => state.rateMode);
  const popupRef = useRef<HTMLDivElement>(null);
  const { setCenter } = useReactFlow();

  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    const updatePosition = () => {
      const bounds = popup.getBoundingClientRect();
      const margin = 12;
      const left = Math.max(margin, Math.min(anchorX, window.innerWidth - bounds.width - margin));
      const top = Math.max(margin, Math.min(anchorY, window.innerHeight - bounds.height - margin));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.visibility = 'visible';
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(popup);
    window.addEventListener('resize', updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorX, anchorY]);

  const navigateToMachine = async (nodeId: string) => {
    const node = nodesMap.get(nodeId);
    if (!node) {
      onDismiss();
      return;
    }

    const collapsedParent =
      isRecipeNode(node) && node.data.groupId ? nodesMap.get(node.data.groupId) : undefined;
    const destination =
      isGroupNode(collapsedParent) && collapsedParent.data.collapsed ? collapsedParent : node;
    const x =
      destination.position.x + (destination.measured?.width ?? destination.width ?? 200) / 2;
    const y =
      destination.position.y + (destination.measured?.height ?? destination.height ?? 120) / 2;

    await setCenter(x, y, { zoom: 1.2, duration: 250 });
    onDismiss();
  };

  if (!edge) return null;

  const isFresh = resultGraphVersion === graphVersion && resultDataDbVersion === dataDbVersion;
  const source = resolveRecipeEndpoint(nodesMap, edge.source, edge.sourceHandle, 'output');
  const target = resolveRecipeEndpoint(nodesMap, edge.target, edge.targetHandle, 'input');
  if (!source || !target) return null;

  const sourceRecipe = isFresh
    ? (nodeRecipes[source.node.id] ??
      resolveActiveRecipe(source.node.data.recipeId, source.node.data.settings, source.node.id) ??
      getRecipe(source.node.data.recipeId))
    : (resolveActiveRecipe(source.node.data.recipeId, source.node.data.settings, source.node.id) ??
      getRecipe(source.node.data.recipeId));
  const targetRecipe = isFresh
    ? (nodeRecipes[target.node.id] ??
      resolveActiveRecipe(target.node.data.recipeId, target.node.data.settings, target.node.id) ??
      getRecipe(target.node.data.recipeId))
    : (resolveActiveRecipe(target.node.data.recipeId, target.node.data.settings, target.node.id) ??
      getRecipe(target.node.data.recipeId));
  const sourceMachineData = sourceRecipe ? getMachine(sourceRecipe.machine_id) : undefined;
  const targetMachineData = targetRecipe ? getMachine(targetRecipe.machine_id) : undefined;
  const sourceMachine = sourceRecipe ? getMachineName(sourceRecipe.machine_id) : 'Unknown machine';
  const targetMachine = targetRecipe ? getMachineName(targetRecipe.machine_id) : 'Unknown machine';
  const resolvedProductId = isFresh
    ? resolvedProducts[buildHandleId(source.node.id, 'output', source.portIndex)]
    : undefined;
  const productId =
    resolvedProductId && resolvedProductId !== 'any_item' && resolvedProductId !== 'any_fluid'
      ? resolvedProductId
      : getRecipeEntryProductId(sourceRecipe, 'output', source.portIndex);
  const flowEdgeId = edge.id.startsWith('proxy-') ? edge.id.slice('proxy-'.length) : edge.id;
  const rawFlow = isFresh ? edgeFlows[flowEdgeId] : undefined;
  const scaledFlow =
    typeof rawFlow === 'number'
      ? rawFlow * getNormalizedCycleTime(sourceRecipe?.cycle_time ?? 1, rateMode)
      : null;
  const sourceTierStyle = {
    '--machine-tier-color': getTierColor(sourceMachineData?.tier),
  } as CSSProperties;
  const targetTierStyle = {
    '--machine-tier-color': getTierColor(targetMachineData?.tier),
  } as CSSProperties;

  return (
    <div
      ref={popupRef}
      className={styles['edge-info-popup']}
      style={{ left: anchorX, top: anchorY, visibility: 'hidden' }}
      data-edge-info-popup
      role="group"
      aria-label="Edge details"
    >
      <div className={styles['edge-info-popup__top']}>
        <span className={styles['edge-info-popup__rate']}>
          {scaledFlow === null ? '—' : `${formatQuantity(scaledFlow)}${getRateSuffix(rateMode)}`}
        </span>
        <span className={styles['edge-info-popup__divider']} aria-hidden="true" />
        <strong
          className={styles['edge-info-popup__product']}
          title={productId ? getProductName(productId) : 'Unknown product'}
        >
          {productId ? getProductName(productId) : 'Unknown product'}
        </strong>
      </div>
      <div className={styles['edge-info-popup__machines']}>
        <button
          type="button"
          title={`Center on ${sourceMachine}`}
          className={`${styles['edge-info-popup__machine']} ${styles['edge-info-popup__machine--source']}`}
          style={sourceTierStyle}
          onClick={(event) => {
            event.stopPropagation();
            void navigateToMachine(source.node.id);
          }}
        >
          {sourceMachine}
        </button>
        <span className={styles['edge-info-popup__arrow']} aria-hidden="true">
          ↓
        </span>
        <button
          type="button"
          title={`Center on ${targetMachine}`}
          className={`${styles['edge-info-popup__machine']} ${styles['edge-info-popup__machine--target']}`}
          style={targetTierStyle}
          onClick={(event) => {
            event.stopPropagation();
            void navigateToMachine(target.node.id);
          }}
        >
          {targetMachine}
        </button>
      </div>
    </div>
  );
}
