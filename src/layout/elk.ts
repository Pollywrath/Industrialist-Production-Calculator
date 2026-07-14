import ELK from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';
import { buildHandleId } from '../utils/idGenerator';
import { GRID_X, GROUP_PADDING, NODE_HANDLE_SIZE, ROOT_PADDING, getLayoutPortY } from './constants';
import type {
  ElkInputEdge,
  ElkInputNode,
  ElkInputPort,
  LayoutEdgePathStyle,
  LayoutEdgePriority,
  LayoutEdgeSpec,
  LayoutNodeSpec,
  LayoutedGraph,
  PortConstraints,
  PortOrderMode,
  ResolvedLayoutOptions,
} from './types';

const elk = new ELK({
  workerFactory: () => new ElkWorker({ name: 'elk-layout-worker' }),
});

function buildPortProperties(side: 'WEST' | 'EAST', displayIndex: number) {
  return {
    'port.side': side,
    'org.eclipse.elk.port.side': side,
    'port.index': String(displayIndex),
    'org.eclipse.elk.port.index': String(displayIndex),
  };
}

function getElkPortOrder(order: number[], mode: PortOrderMode): number[] {
  if (mode === 'current') return order;
  return [...order].sort((a, b) => a - b);
}

function getElkPortIndex(handleIndex: number, displayIndex: number, mode: PortOrderMode): number {
  return mode === 'stable' ? handleIndex : displayIndex;
}

function buildFixedPortPosition(
  side: 'input' | 'output',
  nodeWidth: number,
  centerY: number,
): { x: number; y: number } {
  const y = centerY - NODE_HANDLE_SIZE / 2;
  return {
    x: side === 'input' ? -NODE_HANDLE_SIZE : nodeWidth,
    y,
  };
}

function buildPorts(
  node: LayoutNodeSpec,
  inputOrder: number[],
  outputOrder: number[],
  portConstraints: PortConstraints,
  portOrderMode: PortOrderMode,
): ElkInputPort[] {
  const orderedInputs = getElkPortOrder(inputOrder, portOrderMode);
  const orderedOutputs = getElkPortOrder(outputOrder, portOrderMode);
  const inputCount = orderedInputs.length;
  const outputCount = orderedOutputs.length;

  const inputPorts = orderedInputs.map((handleIndex, displayIndex) => {
    const centerY = getLayoutPortY('input', displayIndex, inputCount, outputCount);
    return {
      id: buildHandleId(node.id, 'input', handleIndex),
      width: NODE_HANDLE_SIZE,
      height: NODE_HANDLE_SIZE,
      properties: buildPortProperties(
        'WEST',
        getElkPortIndex(handleIndex, displayIndex, portOrderMode),
      ),
      ...(portConstraints === 'FIXED_POS'
        ? buildFixedPortPosition('input', node.width, centerY)
        : {}),
    };
  });

  const outputPorts = orderedOutputs.map((handleIndex, displayIndex) => {
    const centerY = getLayoutPortY('output', displayIndex, inputCount, outputCount);
    return {
      id: buildHandleId(node.id, 'output', handleIndex),
      width: NODE_HANDLE_SIZE,
      height: NODE_HANDLE_SIZE,
      properties: buildPortProperties(
        'EAST',
        getElkPortIndex(handleIndex, displayIndex, portOrderMode),
      ),
      ...(portConstraints === 'FIXED_POS'
        ? buildFixedPortPosition('output', node.width, centerY)
        : {}),
    };
  });

  return [...inputPorts, ...outputPorts];
}

function buildHierarchicalElkNodes(
  layoutNodes: LayoutNodeSpec[],
  portConstraints: PortConstraints,
  portOrderMode: PortOrderMode,
): ElkInputNode[] {
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const childrenByParentId = new Map<string | null, LayoutNodeSpec[]>();

  for (let i = 0; i < layoutNodes.length; i++) {
    const node = layoutNodes[i];
    const parentId = node.parentId && layoutNodeIds.has(node.parentId) ? node.parentId : null;
    const children = childrenByParentId.get(parentId);
    if (children) {
      children.push(node);
    } else {
      childrenByParentId.set(parentId, [node]);
    }
  }

  childrenByParentId.forEach((children) => {
    children.sort((a, b) => a.id.localeCompare(b.id));
  });

  const buildNode = (node: LayoutNodeSpec): ElkInputNode => {
    if (node.kind === 'expanded-group') {
      const children = (childrenByParentId.get(node.id) ?? []).map(buildNode);
      const elkNode: ElkInputNode = {
        id: node.id,
        children,
        properties: {
          'elk.padding': GROUP_PADDING,
        },
      };

      if (children.length === 0) {
        elkNode.width = node.width;
        elkNode.height = node.height;
      }

      return elkNode;
    }

    return {
      id: node.id,
      width: node.width,
      height: node.height,
      ports: buildPorts(node, node.inputOrder, node.outputOrder, portConstraints, portOrderMode),
      properties: {
        portConstraints,
        'org.eclipse.elk.portConstraints': portConstraints,
      },
    };
  };

  return (childrenByParentId.get(null) ?? []).map(buildNode);
}

function getEdgePriority(edge: LayoutEdgeSpec, options: ResolvedLayoutOptions): LayoutEdgePriority {
  switch (edge.kind) {
    case 'self-loop':
      return options.edgePriority.selfLoop;
    case 'feedback':
      return options.edgePriority.feedback;
    case 'flow':
      return options.edgePriority.flow;
  }
}

function buildEdgeProperties(
  edge: LayoutEdgeSpec,
  options: ResolvedLayoutOptions,
): Record<string, string> {
  const edgePriority = getEdgePriority(edge, options);
  return {
    'elk.layered.priority.direction': String(edgePriority.direction),
    'elk.layered.priority.shortness': String(edgePriority.shortness),
    'elk.layered.priority.straightness': String(edgePriority.straightness),
  };
}

function buildElkEdges(
  layoutEdges: LayoutEdgeSpec[],
  options: ResolvedLayoutOptions,
): ElkInputEdge[] {
  return layoutEdges.map((edge) => ({
    id: edge.id,
    sources: [edge.sourceHandle ?? buildHandleId(edge.source, 'output', 0)],
    targets: [edge.targetHandle ?? buildHandleId(edge.target, 'input', 0)],
    properties: buildEdgeProperties(edge, options),
  }));
}

function getElkLayoutProperties(
  edgePath: LayoutEdgePathStyle,
  options: ResolvedLayoutOptions,
): Record<string, string> {
  const edgeRouting = edgePath === 'straight' ? 'POLYLINE' : 'ORTHOGONAL';
  const spacing = options.elkSpacing;

  return {
    algorithm: 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': edgeRouting,
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.randomSeed': '1',
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.baseValue': String(GRID_X),
    'elk.spacing.componentComponent': String(spacing.componentComponent),
    'elk.spacing.nodeNode': String(spacing.nodeNode),
    'elk.spacing.edgeNode': String(spacing.edgeNode),
    'elk.spacing.edgeEdge': String(spacing.edgeEdge),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.nodeNodeBetweenLayers),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(spacing.edgeNodeBetweenLayers),
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(spacing.edgeEdgeBetweenLayers),
    'elk.layered.thoroughness': String(options.thoroughness),
    'elk.layered.feedbackEdges': 'true',
    'elk.layered.cycleBreaking.strategy': 'GREEDY',
    'elk.layered.layering.strategy': options.layeringStrategy,
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.crossingMinimization.greedySwitch.activationThreshold': String(
      options.greedySwitchActivationThreshold,
    ),
    'elk.layered.crossingMinimization.greedySwitchHierarchical.type':
      options.greedySwitchHierarchicalType,
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
    'elk.padding': ROOT_PADDING,
  };
}

export async function runElkLayoutPass(
  layoutNodes: LayoutNodeSpec[],
  layoutEdges: LayoutEdgeSpec[],
  edgePath: LayoutEdgePathStyle,
  options: ResolvedLayoutOptions,
  portConstraints: PortConstraints,
  portOrderMode: PortOrderMode,
): Promise<LayoutedGraph> {
  return (await elk.layout({
    id: 'root',
    properties: getElkLayoutProperties(edgePath, options),
    children: buildHierarchicalElkNodes(layoutNodes, portConstraints, portOrderMode),
    edges: buildElkEdges(layoutEdges, options),
  })) as LayoutedGraph;
}
