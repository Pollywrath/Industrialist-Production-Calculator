import { Container, Texture } from 'pixi.js';
import {
  IO_COLUMN_PADDING,
  NODE_WIDTH,
  getRecipeNodeSize,
} from '../../domain/nodes/recipe/geometry';
import type { FlowEdge, EdgeAnimationStyle, EdgeLineStyle } from '../../domain/edges/flow/model';
import type { RecipeNode as FlowNode } from '../../domain/nodes/recipe/model';
import type { NodeVisualDescription, VisualPaint } from '../../domain/graph/type-registry';
import { getCanvasThemeColors } from '../../theme/theme-colors';
import { TriangleMeshBatch, type TriangleBatchItem, type TriangleGeometry } from './mesh-batch';
import { getEdgeCurvePoints, type EdgeCurve, type Point } from './edge-view';
import {
  createNodeGeometry,
  createSelectedNodeGeometry,
  createSelectedPortHandlesGeometry,
  type NodeRenderData,
} from './nodes/recipe';
import {
  createEdgePatternTexture,
  DIRECTION_ARROW_PERIOD,
  EDGE_FLOW_SPEED,
  EDGE_PATTERN_PERIOD,
  MOVING_DASH_PERIOD,
  setEdgePatternOffset,
} from './edge-patterns';
import { bottommostRenderOrder, compareRenderOrder, RENDER_BAND } from './render-order';

const EDGE_STROKE_WIDTH = 2.6;
const SELECTED_EDGE_STROKE_WIDTH = 3.6;
const BEZIER_RENDER_SEGMENTS = 8;

interface EdgeTextureSet {
  readonly line: Record<EdgeLineStyle, Texture>;
  readonly animatedLine: Record<EdgeLineStyle, Texture>;
  readonly pulseArrow: Texture;
}

let sharedEdgeTextures: EdgeTextureSet | null = null;

function getSharedEdgeTextures(): EdgeTextureSet {
  if (sharedEdgeTextures) return sharedEdgeTextures;
  sharedEdgeTextures = {
    line: {
      solid: Texture.WHITE,
      dashed: createEdgePatternTexture('dashed'),
      dotted: createEdgePatternTexture('dotted'),
    },
    animatedLine: {
      solid: createEdgePatternTexture('moving-dashes'),
      dashed: createEdgePatternTexture('moving-dashes'),
      dotted: createEdgePatternTexture('dotted'),
    },
    pulseArrow: createEdgePatternTexture('pulse-arrow'),
  };
  return sharedEdgeTextures;
}

function nodeGroupKey(data: NodeRenderData) {
  const { width, height } = data.visual?.bounds ?? getRecipeNodeSize(data.node);
  return `${data.position.x}:${data.position.y}:${width}:${height}`;
}

function edgeGroupKey(curve: EdgeCurve, edge: FlowEdge) {
  const points = curve.points ?? [curve.start, curve.control1, curve.control2, curve.tip];
  const width =
    (edge.settings as FlowEdge['settings'] & { readonly lineWidth?: number }).lineWidth ??
    EDGE_STROKE_WIDTH;
  const renderColor = (edge.settings as FlowEdge['settings'] & { readonly rendererColor?: number })
    .rendererColor;
  const renderAlpha =
    (edge.settings as FlowEdge['settings'] & { readonly rendererAlpha?: number }).rendererAlpha ??
    1;
  return `${edge.settings.lineStyle}:${edge.settings.animationStyle}:${width}:${renderColor ?? ''}:${renderAlpha}:${curve.pathStyle ?? 'orthogonal'}:${points
    .map((point) => `${point.x}:${point.y}`)
    .join(':')}`;
}

function nodeBoundsOverlap(left: NodeRenderData, right: NodeRenderData) {
  const leftSize = left.visual?.bounds ?? getRecipeNodeSize(left.node);
  const rightSize = right.visual?.bounds ?? getRecipeNodeSize(right.node);
  return (
    left.position.x <= right.position.x + rightSize.width &&
    left.position.x + leftSize.width >= right.position.x &&
    left.position.y <= right.position.y + rightSize.height &&
    left.position.y + leftSize.height >= right.position.y
  );
}

interface EdgeSegment {
  readonly start: Point;
  readonly end: Point;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly startDistance: number;
  readonly endDistance: number;
}

function edgeGeometry(
  curve: EdgeCurve,
  lineWidth: number,
  texturePeriod = EDGE_PATTERN_PERIOD,
): TriangleGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sourcePoints = getEdgeCurvePoints(curve, BEZIER_RENDER_SEGMENTS);
  const points = sourcePoints.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point.x - sourcePoints[index - 1].x, point.y - sourcePoints[index - 1].y) > 0.001,
  );
  const segments: EdgeSegment[] = [];
  const halfWidth = lineWidth / 2;
  let distance = 0;

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) continue;
    const tangentX = dx / length;
    const tangentY = dy / length;
    const segment: EdgeSegment = {
      start,
      end,
      tangentX,
      tangentY,
      normalX: -tangentY,
      normalY: tangentX,
      startDistance: distance,
      endDistance: distance + length,
    };
    segments.push(segment);
    const base = positions.length / 2;
    positions.push(
      start.x + segment.normalX * halfWidth,
      start.y + segment.normalY * halfWidth,
      start.x - segment.normalX * halfWidth,
      start.y - segment.normalY * halfWidth,
      end.x + segment.normalX * halfWidth,
      end.y + segment.normalY * halfWidth,
      end.x - segment.normalX * halfWidth,
      end.y - segment.normalY * halfWidth,
    );
    uvs.push(
      segment.startDistance / texturePeriod,
      0,
      segment.startDistance / texturePeriod,
      1,
      segment.endDistance / texturePeriod,
      0,
      segment.endDistance / texturePeriod,
      1,
    );
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    distance += length;
  }

  for (let index = 1; index < segments.length; index++) {
    const before = segments[index - 1];
    const after = segments[index];
    const cross = before.tangentX * after.tangentY - before.tangentY * after.tangentX;
    if (Math.abs(cross) < 0.0001) continue;
    const side = Math.sign(cross);
    const point = before.end;
    const base = positions.length / 2;
    positions.push(
      point.x,
      point.y,
      point.x + before.normalX * halfWidth * side,
      point.y + before.normalY * halfWidth * side,
      point.x + after.normalX * halfWidth * side,
      point.y + after.normalY * halfWidth * side,
    );
    uvs.push(
      before.endDistance / texturePeriod,
      0.5,
      before.endDistance / texturePeriod,
      side > 0 ? 0 : 1,
      before.endDistance / texturePeriod,
      side > 0 ? 0 : 1,
    );
    indices.push(base, base + 1, base + 2);
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

function toBatchItem(id: string, geometry: TriangleGeometry): TriangleBatchItem {
  return {
    id,
    positions: geometry.positions,
    uvs: geometry.uvs,
    indices: geometry.indices,
  };
}

function sameIds<T>(current: ReadonlyMap<string, T>, nextIds: readonly string[]) {
  return current.size === nextIds.length && nextIds.every((id) => current.has(id));
}

function isAnimatedEdge(edge: FlowEdge) {
  return edge.settings.animationStyle !== 'none';
}

export class GraphMeshRenderer {
  private readonly themeColors = getCanvasThemeColors();
  private readonly edgeBatches = new Map<string, TriangleMeshBatch>();
  private readonly nodeBatch: TriangleMeshBatch;
  private readonly nodePaletteTexture: Texture;
  private readonly nodePaletteIndex: (paint: VisualPaint) => number;
  private readonly edgeLayer: Container;
  private readonly nodeLayer: Container;
  private readonly nodeBodyStrategy: 'batch' | 'per-node-container';
  private readonly perNodeBodies = new Map<
    string,
    { readonly container: Container; readonly batch: TriangleMeshBatch }
  >();
  private readonly selectedNodeBatch: TriangleMeshBatch;
  private readonly selectedPortHandlesBatch: TriangleMeshBatch;
  private readonly selectedEdgeBatch: TriangleMeshBatch;
  private readonly animatedEdgeBatch: TriangleMeshBatch;
  private readonly edgeTextures: Record<EdgeLineStyle, Texture>;
  private readonly animatedEdgeTextures: Record<EdgeLineStyle, Texture>;
  private readonly pulseArrowTexture: Texture;
  private readonly recipeNodeGeometryCache = new WeakMap<
    FlowNode,
    {
      readonly x: number;
      readonly y: number;
      readonly geometry: TriangleGeometry;
    }
  >();
  private readonly edgeGeometryCache = new WeakMap<EdgeCurve, Map<string, TriangleGeometry>>();
  private nodes = new Map<string, NodeRenderData>();
  private nodeGroups = new Map<string, Set<string>>();
  private nodeGroupForId = new Map<string, string>();
  private nodeGroupRepresentatives = new Map<string, string>();
  private maxNodeOrder = -1;
  private edges = new Map<string, FlowEdge>();
  private curves = new Map<string, EdgeCurve>();
  private edgeGroups = new Map<string, Set<string>>();
  private edgeGroupForId = new Map<string, string>();
  private edgeGroupRepresentatives = new Map<string, string>();
  private edgeBatchKeyById = new Map<string, string>();
  private animatedEdgeCount = 0;
  private selectedNodeId: string | null = null;
  private selectedNodeIds: ReadonlySet<string> = new Set();
  private selectedEdgeId: string | null = null;
  private batchDepth = 0;
  private selectionRebuildPending = false;

  constructor(
    edgeLayer: Container,
    nodeLayer: Container,
    nodePaletteTexture: Texture,
    nodeSelectionLayer: Container = nodeLayer,
    nodeBodyStrategy: 'batch' | 'per-node-container' = 'batch',
    nodePaletteIndex: (paint: VisualPaint) => number = () => 0,
  ) {
    this.edgeLayer = edgeLayer;
    this.nodeLayer = nodeLayer;
    this.nodeBodyStrategy = nodeBodyStrategy;
    this.nodePaletteTexture = nodePaletteTexture;
    this.nodePaletteIndex = nodePaletteIndex;
    edgeLayer.eventMode = 'none';
    edgeLayer.interactiveChildren = false;
    nodeLayer.eventMode = 'none';
    nodeLayer.interactiveChildren = false;
    const sharedEdgeTextures = getSharedEdgeTextures();
    this.edgeTextures = sharedEdgeTextures.line;
    this.animatedEdgeTextures = sharedEdgeTextures.animatedLine;
    this.pulseArrowTexture = sharedEdgeTextures.pulseArrow;
    for (const lineStyle of ['solid', 'dashed', 'dotted'] as const) {
      for (const animationStyle of ['none', 'moving-dashes', 'pulse-arrow'] as const) {
        const texture =
          animationStyle === 'moving-dashes'
            ? this.animatedEdgeTextures[lineStyle]
            : this.edgeTextures[lineStyle];
        this.edgeBatches.set(
          this.makeEdgeBatchKey(lineStyle, animationStyle, this.themeColors.edge, 1),
          new TriangleMeshBatch(this.themeColors.edge, texture, undefined, 'no-batch'),
        );
      }
    }
    this.nodeBatch = new TriangleMeshBatch(this.themeColors.white, nodePaletteTexture);
    this.selectedNodeBatch = new TriangleMeshBatch(this.themeColors.nodeSelected);
    this.selectedPortHandlesBatch = new TriangleMeshBatch(
      this.themeColors.white,
      nodePaletteTexture,
    );
    this.selectedEdgeBatch = new TriangleMeshBatch(
      this.themeColors.selected,
      this.edgeTextures.solid,
      undefined,
      'no-batch',
    );
    this.animatedEdgeBatch = new TriangleMeshBatch(
      this.themeColors.selected,
      this.pulseArrowTexture,
      undefined,
      'no-batch',
    );
    edgeLayer.addChild(
      ...[...this.edgeBatches.values()].map((batch) => batch.mesh),
      this.selectedEdgeBatch.mesh,
      this.animatedEdgeBatch.mesh,
    );
    nodeLayer.addChild(this.nodeBatch.mesh);
    nodeSelectionLayer.addChild(this.selectedNodeBatch.mesh, this.selectedPortHandlesBatch.mesh);
  }

  get visibleNodeCount() {
    return this.nodes.size;
  }

  get visibleEdgeCount() {
    return this.edges.size;
  }

  get edgeBatch() {
    return this.edgeBatches.get(this.makeEdgeBatchKey('solid', 'none', this.themeColors.edge, 1))!;
  }

  get renderedNodeGeometryCount() {
    return this.nodeBodyStrategy === 'batch'
      ? this.nodeBatch.size
      : [...this.perNodeBodies.values()].reduce((count, body) => count + body.batch.size, 0);
  }

  get renderedEdgeGeometryCount() {
    return [...this.edgeBatches.values()].reduce((count, batch) => count + batch.size, 0);
  }

  get hasAnimatedEdges() {
    return this.animatedEdgeCount > 0;
  }

  batchUpdates<T>(update: () => T): T {
    this.batchDepth++;
    try {
      let run = () =>
        this.nodeBatch.batchUpdates(() =>
          this.selectedNodeBatch.batchUpdates(() =>
            this.selectedPortHandlesBatch.batchUpdates(() =>
              this.selectedEdgeBatch.batchUpdates(() =>
                this.animatedEdgeBatch.batchUpdates(update),
              ),
            ),
          ),
        );
      const edgeBatches = [...this.edgeBatches.values()];
      for (let index = edgeBatches.length - 1; index >= 0; index--) {
        const batch = edgeBatches[index];
        const next = run;
        run = () => batch.batchUpdates(next);
      }
      return run();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.selectionRebuildPending) {
        this.selectionRebuildPending = false;
        this.rebuildSelectionOverlays();
      }
    }
  }

  markRendered() {
    this.nodeBatch.markRendered();
    for (const body of this.perNodeBodies.values()) body.batch.markRendered();
    for (const batch of this.edgeBatches.values()) batch.markRendered();
    this.selectedNodeBatch.markRendered();
    this.selectedPortHandlesBatch.markRendered();
    this.selectedEdgeBatch.markRendered();
    this.animatedEdgeBatch.markRendered();
  }

  isNodeGroupRepresentative(nodeId: string) {
    if (this.nodeBodyStrategy === 'per-node-container') return this.perNodeBodies.has(nodeId);
    const key = this.nodeGroupForId.get(nodeId);
    return key !== undefined && this.nodeGroupRepresentatives.get(key) === nodeId;
  }

  sync(
    nodes: readonly NodeRenderData[],
    edges: readonly FlowEdge[],
    curves: ReadonlyMap<string, EdgeCurve>,
    force = false,
  ) {
    this.batchUpdates(() => this.syncInBatch(nodes, edges, curves, force));
  }

  private syncInBatch(
    nodes: readonly NodeRenderData[],
    edges: readonly FlowEdge[],
    curves: ReadonlyMap<string, EdgeCurve>,
    force: boolean,
  ) {
    const nodeIds = nodes.map((item) => item.node.id);
    const edgeIds = edges.map((edge) => edge.id);
    const nodesChanged = force || !sameIds(this.nodes, nodeIds);
    const edgesChanged = force || !sameIds(this.edges, edgeIds);
    const nextNodes = new Map(nodes.map((item) => [item.node.id, item]));
    const nextEdges = new Map(edges.map((edge) => [edge.id, edge]));
    const nextCurves = new Map(
      edges.flatMap((edge) => {
        const curve = curves.get(edge.id);
        return curve ? [[edge.id, curve] as const] : [];
      }),
    );

    if (nodesChanged) {
      if (force || this.nodes.size === 0) {
        this.nodes = nextNodes;
        this.rebuildNodes();
      } else {
        this.removeVisibleNodes([...this.nodes.keys()].filter((id) => !nextNodes.has(id)));
        this.addVisibleNodes(
          [...nextNodes].filter(([id]) => !this.nodes.has(id)).map(([, data]) => data),
        );
      }
    }
    if (edgesChanged) {
      if (force || this.edges.size === 0) {
        this.edges = nextEdges;
        this.curves = nextCurves;
        this.animatedEdgeCount = [...nextEdges.values()].filter(isAnimatedEdge).length;
        this.rebuildEdges();
      } else {
        this.removeVisibleEdges([...this.edges.keys()].filter((id) => !nextEdges.has(id)));
        this.addVisibleEdges(
          [...nextEdges]
            .filter(([id]) => !this.edges.has(id))
            .flatMap(([id, edge]) => {
              const curve = nextCurves.get(id);
              return curve ? [{ edge, curve }] : [];
            }),
        );
      }
    }
    const selectedNodeVisibilityChanged = [...this.selectedNodeIds].some(
      (id) => this.selectedNodeBatch.has(id) !== this.hasNodeBody(id),
    );
    const selectedEdgeVisibilityChanged =
      !!this.selectedEdgeId &&
      this.selectedEdgeBatch.has(this.selectedEdgeId) !== this.edges.has(this.selectedEdgeId);
    if (force || selectedNodeVisibilityChanged || selectedEdgeVisibilityChanged)
      this.requestSelectionRebuild();
  }

  updateNode(
    node: FlowNode,
    position: Point,
    visual?: NodeVisualDescription,
    portPositions?: ReadonlyMap<string, Point>,
  ) {
    const previous = this.nodes.get(node.id);
    if (!previous) return;
    const data = { node, position, order: previous.order, visual, portPositions };
    if (visual === undefined && previous.visual !== undefined) data.visual = previous.visual;
    if (portPositions === undefined && previous.portPositions !== undefined)
      data.portPositions = previous.portPositions;
    const oldKey = this.nodeGroupForId.get(node.id)!;
    const nextKey = nodeGroupKey(data);
    this.nodes.set(node.id, data);
    if (this.nodeBodyStrategy === 'per-node-container') {
      const body = this.perNodeBodies.get(node.id);
      if (body) body.batch.add(toBatchItem(node.id, this.createNodeGeometry(data)));
      if (this.selectedNodeIds.has(node.id)) this.requestSelectionRebuild();
      return;
    }

    if (oldKey !== nextKey) {
      const oldGroup = this.nodeGroups.get(oldKey)!;
      const wasOldRepresentative = this.nodeGroupRepresentatives.get(oldKey) === node.id;
      oldGroup.delete(node.id);
      this.nodeGroupForId.delete(node.id);
      let oldRepresentativeChanged = false;
      if (oldGroup.size === 0) {
        this.nodeGroups.delete(oldKey);
        this.nodeGroupRepresentatives.delete(oldKey);
      } else if (wasOldRepresentative) {
        this.nodeGroupRepresentatives.set(oldKey, this.findTopNode(oldGroup));
        oldRepresentativeChanged = true;
      }

      const nextGroup = this.nodeGroups.get(nextKey);
      const newGroupIsUnique = !nextGroup;
      const group = nextGroup ?? new Set<string>();
      group.add(node.id);
      this.nodeGroups.set(nextKey, group);
      this.nodeGroupForId.set(node.id, nextKey);
      const previousRepresentative = this.nodeGroupRepresentatives.get(nextKey);
      const newRepresentativeChanged =
        !previousRepresentative ||
        data.order > (this.nodes.get(previousRepresentative)?.order ?? -1);
      if (newRepresentativeChanged) this.nodeGroupRepresentatives.set(nextKey, node.id);

      if (oldRepresentativeChanged || (!newGroupIsUnique && newRepresentativeChanged)) {
        this.rebuildNodes();
      } else {
        if (wasOldRepresentative && oldGroup.size === 0) this.nodeBatch.remove(node.id);
        if (newGroupIsUnique) {
          this.nodeBatch.add(toBatchItem(node.id, this.createNodeGeometry(data)));
        }
        if (this.wouldBreakDrawOrder(data)) this.rebuildNodes();
      }
    } else if (this.nodeGroupRepresentatives.get(oldKey) === node.id) {
      const geometry = this.createNodeGeometry(data);
      if (!this.nodeBatch.update(node.id, geometry.positions)) this.rebuildNodes();
    }

    if (this.selectedNodeIds.has(node.id)) this.requestSelectionRebuild();
  }

  addVisibleNode(data: NodeRenderData) {
    this.addVisibleNodes([data]);
  }

  addVisibleNodes(items: readonly NodeRenderData[]) {
    const added = items.filter((data) => !this.nodes.has(data.node.id));
    if (added.length === 0) return;
    if (this.nodeBodyStrategy === 'per-node-container') {
      for (const data of added) {
        this.nodes.set(data.node.id, data);
        this.maxNodeOrder = Math.max(this.maxNodeOrder, data.order);
        this.addPerNodeBody(data);
      }
      this.syncPerNodeBodyOrder();
      if (added.some((data) => this.selectedNodeIds.has(data.node.id)))
        this.requestSelectionRebuild();
      return;
    }
    let rebuild = false;
    const newRepresentatives: TriangleBatchItem[] = [];
    for (const data of added) {
      this.nodes.set(data.node.id, data);
      const key = nodeGroupKey(data);
      const group = this.nodeGroups.get(key);
      this.nodeGroupForId.set(data.node.id, key);
      if (!group) {
        this.nodeGroups.set(key, new Set([data.node.id]));
        this.nodeGroupRepresentatives.set(key, data.node.id);
        newRepresentatives.push(toBatchItem(data.node.id, this.createNodeGeometry(data)));
      } else {
        group.add(data.node.id);
        const representativeId = this.nodeGroupRepresentatives.get(key)!;
        if (data.order > (this.nodes.get(representativeId)?.order ?? -1)) {
          this.nodeGroupRepresentatives.set(key, data.node.id);
          rebuild = true;
        }
      }
      if (this.wouldBreakDrawOrder(data)) rebuild = true;
      this.maxNodeOrder = Math.max(this.maxNodeOrder, data.order);
    }
    if (rebuild) this.rebuildNodes();
    else this.nodeBatch.addMany(newRepresentatives);
    if (added.some((data) => this.selectedNodeIds.has(data.node.id)))
      this.requestSelectionRebuild();
  }

  removeVisibleNode(nodeId: string) {
    this.removeVisibleNodes([nodeId]);
  }

  removeVisibleNodes(nodeIds: readonly string[]) {
    if (this.nodeBodyStrategy === 'per-node-container') {
      let recalculateMaxNodeOrder = false;
      for (const nodeId of nodeIds) {
        const data = this.nodes.get(nodeId);
        if (!data) continue;
        const body = this.perNodeBodies.get(nodeId);
        if (body) {
          this.nodeLayer.removeChild(body.container);
          body.batch.destroy();
          body.container.destroy({ children: true });
          this.perNodeBodies.delete(nodeId);
        }
        this.nodes.delete(nodeId);
        this.selectedNodeBatch.remove(nodeId);
        this.selectedPortHandlesBatch.remove(nodeId);
        if (data.order === this.maxNodeOrder) recalculateMaxNodeOrder = true;
      }
      if (recalculateMaxNodeOrder) {
        this.maxNodeOrder = Math.max(-1, ...[...this.nodes.values()].map((item) => item.order));
      }
      return;
    }
    let rebuild = false;
    let recalculateMaxNodeOrder = false;
    for (const nodeId of nodeIds) {
      const data = this.nodes.get(nodeId);
      if (!data) continue;
      const key = this.nodeGroupForId.get(nodeId)!;
      const group = this.nodeGroups.get(key)!;
      const wasRepresentative = this.nodeGroupRepresentatives.get(key) === nodeId;
      group.delete(nodeId);
      this.nodeGroupForId.delete(nodeId);
      if (group.size === 0) {
        this.nodeGroups.delete(key);
        this.nodeGroupRepresentatives.delete(key);
        if (wasRepresentative) this.nodeBatch.remove(nodeId);
      } else if (wasRepresentative) {
        this.nodeGroupRepresentatives.set(key, this.findTopNode(group));
        rebuild = true;
      }
      this.nodes.delete(nodeId);
      this.selectedNodeBatch.remove(nodeId);
      this.selectedPortHandlesBatch.remove(nodeId);
      if (data.order === this.maxNodeOrder) recalculateMaxNodeOrder = true;
    }
    if (recalculateMaxNodeOrder) {
      this.maxNodeOrder = Math.max(-1, ...[...this.nodes.values()].map((item) => item.order));
    }
    if (rebuild) this.rebuildNodes();
  }

  updateEdge(edge: FlowEdge, curve: EdgeCurve | null) {
    const previousEdge = this.edges.get(edge.id);
    if (!previousEdge) return;
    const oldKey = this.edgeGroupForId.get(edge.id);
    const oldBatchKey = this.edgeBatchKeyById.get(edge.id);
    const oldBatch = oldBatchKey ? this.edgeBatches.get(oldBatchKey) : undefined;
    const nextKey = curve ? edgeGroupKey(curve, edge) : undefined;
    this.edges.set(edge.id, edge);
    if (
      previousEdge.settings.animationStyle === 'pulse-arrow' &&
      edge.settings.animationStyle !== 'pulse-arrow'
    ) {
      this.animatedEdgeBatch.remove(edge.id);
    }
    if (curve && isAnimatedEdge(previousEdge) !== isAnimatedEdge(edge)) {
      this.animatedEdgeCount += isAnimatedEdge(edge) ? 1 : -1;
    }

    if (oldKey !== undefined && oldKey === nextKey && curve) {
      this.curves.set(edge.id, curve);
      if (this.selectedEdgeId === edge.id) this.updateSelectedEdge(curve);
      return;
    }

    let retainGeometryRange = false;
    if (oldKey !== undefined) {
      const oldRepresentative = this.edgeGroupRepresentatives.get(oldKey) === edge.id;
      const oldGroup = this.edgeGroups.get(oldKey);
      oldGroup?.delete(edge.id);
      this.edgeGroupForId.delete(edge.id);
      if (!oldGroup || oldGroup.size === 0) {
        this.edgeGroups.delete(oldKey);
        this.edgeGroupRepresentatives.delete(oldKey);
        if (oldRepresentative && oldGroup) {
          retainGeometryRange = true;
        } else if (oldRepresentative) {
          oldBatch?.remove(edge.id);
          this.animatedEdgeBatch.remove(edge.id);
        }
      } else if (oldRepresentative) {
        const nextRepresentative = oldGroup.values().next().value as string;
        this.edgeGroupRepresentatives.set(oldKey, nextRepresentative);
        oldBatch?.remove(edge.id);
        this.animatedEdgeBatch.remove(edge.id);
        const nextCurve = this.curves.get(nextRepresentative);
        if (nextCurve) {
          const representativeEdge = this.edges.get(nextRepresentative);
          if (representativeEdge)
            this.edgeBatchFor(representativeEdge).add(
              toBatchItem(
                nextRepresentative,
                this.createEdgeGeometry(nextCurve, this.edgeLineWidth(representativeEdge)),
              ),
            );
          if (representativeEdge)
            this.addAnimatedEdge(
              nextRepresentative,
              nextCurve,
              representativeEdge.settings.animationStyle,
            );
        }
      }
    }

    if (!curve) {
      if (retainGeometryRange) {
        oldBatch?.remove(edge.id);
        this.animatedEdgeBatch.remove(edge.id);
      }
      this.edges.delete(edge.id);
      if (isAnimatedEdge(previousEdge)) this.animatedEdgeCount--;
      this.curves.delete(edge.id);
      this.edgeBatchKeyById.delete(edge.id);
      this.selectedEdgeBatch.remove(edge.id);
      return;
    }

    this.curves.set(edge.id, curve);
    const key = nextKey!;
    const group = this.edgeGroups.get(key);
    this.edgeGroupForId.set(edge.id, key);
    this.edgeBatchKeyById.set(edge.id, this.edgeBatchKey(edge));
    if (!group) {
      if (retainGeometryRange && oldBatchKey !== this.edgeBatchKey(edge)) oldBatch?.remove(edge.id);
      this.edgeGroups.set(key, new Set([edge.id]));
      this.edgeGroupRepresentatives.set(key, edge.id);
      this.edgeBatchFor(edge).add(
        toBatchItem(edge.id, this.createEdgeGeometry(curve, this.edgeLineWidth(edge))),
      );
      this.addAnimatedEdge(edge.id, curve, edge.settings.animationStyle);
    } else {
      if (retainGeometryRange) {
        oldBatch?.remove(edge.id);
        this.animatedEdgeBatch.remove(edge.id);
      }
      group.add(edge.id);
    }
    if (this.selectedEdgeId === edge.id) this.updateSelectedEdge(curve);
  }

  updateEdges(items: readonly { readonly edge: FlowEdge; readonly curve: EdgeCurve | null }[]) {
    this.batchUpdates(() => {
      for (const { edge, curve } of items) this.updateEdge(edge, curve);
    });
  }

  updateAnimation(time: number) {
    const phase = ((time * EDGE_FLOW_SPEED) / MOVING_DASH_PERIOD) % 1;
    for (const texture of Object.values(this.animatedEdgeTextures))
      setEdgePatternOffset(texture, phase);
    setEdgePatternOffset(this.pulseArrowTexture, time % 1);
  }

  addVisibleEdge(edge: FlowEdge, curve: EdgeCurve) {
    this.addVisibleEdges([{ edge, curve }]);
  }

  addVisibleEdges(items: readonly { readonly edge: FlowEdge; readonly curve: EdgeCurve }[]) {
    const added = items.filter(({ edge }) => !this.edges.has(edge.id));
    if (added.length === 0) return;
    const representatives = new Map<string, TriangleBatchItem[]>();
    const animatedRepresentatives: TriangleBatchItem[] = [];
    for (const { edge, curve } of added) {
      this.edges.set(edge.id, edge);
      if (isAnimatedEdge(edge)) this.animatedEdgeCount++;
      this.curves.set(edge.id, curve);
      const key = edgeGroupKey(curve, edge);
      this.edgeGroupForId.set(edge.id, key);
      const batchKey = this.edgeBatchKey(edge);
      this.edgeBatchKeyById.set(edge.id, batchKey);
      this.edgeBatchFor(edge);
      const group = this.edgeGroups.get(key);
      if (!group) {
        this.edgeGroups.set(key, new Set([edge.id]));
        this.edgeGroupRepresentatives.set(key, edge.id);
        const batchItems = representatives.get(batchKey) ?? [];
        batchItems.push(
          toBatchItem(edge.id, this.createEdgeGeometry(curve, this.edgeLineWidth(edge))),
        );
        representatives.set(batchKey, batchItems);
        const animatedGeometry = this.createAnimatedGeometry(curve, edge.settings.animationStyle);
        if (animatedGeometry) animatedRepresentatives.push(toBatchItem(edge.id, animatedGeometry));
      } else {
        group.add(edge.id);
      }
    }
    for (const [batchKey, batchItems] of representatives)
      this.edgeBatches.get(batchKey)?.addMany(batchItems);
    this.animatedEdgeBatch.addMany(animatedRepresentatives);
    const selected = added.find(({ edge }) => edge.id === this.selectedEdgeId);
    if (selected) {
      this.selectedEdgeBatch.setTexture(this.edgeTextureFor(selected.edge));
      this.selectedEdgeBatch.add(
        toBatchItem(selected.edge.id, this.createEdgeGeometry(selected.curve, 3)),
      );
    }
  }

  removeVisibleEdge(edgeId: string) {
    this.removeVisibleEdges([edgeId]);
  }

  removeVisibleEdges(edgeIds: readonly string[]) {
    this.batchUpdates(() => this.removeVisibleEdgesInBatch(edgeIds));
  }

  private removeVisibleEdgesInBatch(edgeIds: readonly string[]) {
    const replacementGroupKeys = new Set<string>();
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (!edge || !this.edges.delete(edgeId)) continue;
      if (isAnimatedEdge(edge)) this.animatedEdgeCount--;
      this.curves.delete(edgeId);
      const batchKey = this.edgeBatchKeyById.get(edgeId);
      const batch = batchKey ? this.edgeBatches.get(batchKey) : undefined;
      this.edgeBatchKeyById.delete(edgeId);
      const key = this.edgeGroupForId.get(edgeId)!;
      const group = this.edgeGroups.get(key)!;
      const wasRepresentative = this.edgeGroupRepresentatives.get(key) === edgeId;
      group.delete(edgeId);
      this.edgeGroupForId.delete(edgeId);
      if (group.size === 0) {
        this.edgeGroups.delete(key);
        this.edgeGroupRepresentatives.delete(key);
        if (wasRepresentative) {
          batch?.remove(edgeId);
          this.animatedEdgeBatch.remove(edgeId);
        }
      } else if (wasRepresentative) {
        const nextRepresentative = group.values().next().value as string;
        this.edgeGroupRepresentatives.set(key, nextRepresentative);
        replacementGroupKeys.add(key);
        batch?.remove(edgeId);
        this.animatedEdgeBatch.remove(edgeId);
      }
      this.selectedEdgeBatch.remove(edgeId);
    }
    const replacements = [...replacementGroupKeys].flatMap((key) => {
      const id = this.edgeGroupRepresentatives.get(key);
      const edge = id && this.edges.get(id);
      const curve = id && this.curves.get(id);
      const batch = edge && this.edgeBatchFor(edge);
      return id && edge && curve && batch && !batch.has(id)
        ? [toBatchItem(id, this.createEdgeGeometry(curve, this.edgeLineWidth(this.edges.get(id)!)))]
        : [];
    });
    for (const item of replacements) {
      const edge = this.edges.get(item.id);
      if (edge) this.edgeBatchFor(edge).add(item);
    }
    const animatedReplacements = [...replacementGroupKeys].flatMap((key) => {
      const id = this.edgeGroupRepresentatives.get(key);
      const edge = id && this.edges.get(id);
      const curve = id && this.curves.get(id);
      const geometry =
        curve && edge && this.createAnimatedGeometry(curve, edge.settings.animationStyle);
      return id && geometry && !this.animatedEdgeBatch.has(id) ? [toBatchItem(id, geometry)] : [];
    });
    this.animatedEdgeBatch.addMany(animatedReplacements);
  }

  setSelection(nodeId: string | null, edgeId: string | null) {
    this.setNodeSelection(nodeId ? [nodeId] : [], nodeId, edgeId);
  }

  setNodeSelection(
    nodeIds: readonly string[],
    primaryNodeId: string | null,
    edgeId: string | null,
  ) {
    const nextIds = new Set(nodeIds);
    if (
      this.selectedNodeId === primaryNodeId &&
      this.selectedEdgeId === edgeId &&
      nextIds.size === this.selectedNodeIds.size &&
      [...nextIds].every((id) => this.selectedNodeIds.has(id))
    )
      return;
    this.selectedNodeId = primaryNodeId;
    this.selectedNodeIds = nextIds;
    this.selectedEdgeId = edgeId;
    this.requestSelectionRebuild();
  }

  bringNodeToFront(nodeId: string, order: number) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    if (node.order === order) return false;
    this.nodes.set(nodeId, { ...node, order });
    this.maxNodeOrder = Math.max(this.maxNodeOrder, order);
    this.rebuildNodes();
    return true;
  }

  bringNodesToFront(orders: ReadonlyMap<string, number>) {
    let changed = false;
    for (const [nodeId, order] of orders) {
      const node = this.nodes.get(nodeId);
      if (!node || node.order === order) continue;
      this.nodes.set(nodeId, { ...node, order });
      this.maxNodeOrder = Math.max(this.maxNodeOrder, order);
      changed = true;
    }
    if (changed) this.rebuildNodes();
    return changed;
  }

  destroy() {
    for (const batch of this.edgeBatches.values()) batch.destroy();
    for (const body of this.perNodeBodies.values()) {
      this.nodeLayer.removeChild(body.container);
      body.batch.destroy();
      body.container.destroy({ children: true });
    }
    this.perNodeBodies.clear();
    this.nodeBatch.destroy();
    this.selectedNodeBatch.destroy();
    this.selectedPortHandlesBatch.destroy();
    this.selectedEdgeBatch.destroy();
    this.animatedEdgeBatch.destroy();
    this.nodes.clear();
    this.nodeGroups.clear();
    this.nodeGroupForId.clear();
    this.nodeGroupRepresentatives.clear();
    this.edges.clear();
    this.animatedEdgeCount = 0;
    this.curves.clear();
    this.edgeGroups.clear();
    this.edgeGroupForId.clear();
    this.edgeGroupRepresentatives.clear();
    this.edgeBatchKeyById.clear();
  }

  private rebuildNodes() {
    this.nodeGroups.clear();
    this.nodeGroupForId.clear();
    this.nodeGroupRepresentatives.clear();
    this.maxNodeOrder = -1;
    const orderedNodes = bottommostRenderOrder(
      [...this.nodes].map(([id, data]) => ({
        id,
        data,
        order: data.order,
        band: RENDER_BAND.nodeBody,
      })),
    );
    if (this.nodeBodyStrategy === 'per-node-container') {
      this.clearPerNodeBodies();
      this.nodeBatch.rebuild([]);
      for (const { data } of orderedNodes) {
        this.maxNodeOrder = Math.max(this.maxNodeOrder, data.order);
        this.addPerNodeBody(data);
      }
      this.syncPerNodeBodyOrder();
      return;
    }
    for (const { id, data } of orderedNodes) {
      const key = nodeGroupKey(data);
      let group = this.nodeGroups.get(key);
      if (!group) this.nodeGroups.set(key, (group = new Set()));
      group.add(id);
      this.nodeGroupForId.set(id, key);
      this.nodeGroupRepresentatives.set(key, id);
      this.maxNodeOrder = Math.max(this.maxNodeOrder, data.order);
    }
    const items = [...this.nodeGroupRepresentatives.values()]
      .map((id) => this.nodes.get(id)!)
      .sort((left, right) =>
        compareRenderOrder(
          { id: left.node.id, order: left.order, band: RENDER_BAND.nodeBody },
          { id: right.node.id, order: right.order, band: RENDER_BAND.nodeBody },
        ),
      )
      .map((data) => toBatchItem(data.node.id, this.createNodeGeometry(data)));
    this.nodeBatch.rebuild(items);
  }

  private hasNodeBody(id: string) {
    return this.nodeBodyStrategy === 'batch'
      ? this.nodeBatch.has(id)
      : (this.perNodeBodies.get(id)?.batch.has(id) ?? false);
  }

  private addPerNodeBody(data: NodeRenderData) {
    const container = new Container();
    container.label = data.node.id;
    container.eventMode = 'none';
    container.interactiveChildren = false;
    const batch = new TriangleMeshBatch(this.themeColors.white, this.nodePaletteTexture);
    batch.add(toBatchItem(data.node.id, this.createNodeGeometry(data)));
    container.addChild(batch.mesh);
    this.nodeLayer.addChild(container);
    this.perNodeBodies.set(data.node.id, { container, batch });
  }

  private createNodeGeometry(data: NodeRenderData) {
    if (data.node.type === 'recipe' && data.visual === undefined) {
      const cached = this.recipeNodeGeometryCache.get(data.node);
      if (cached?.x === data.position.x && cached.y === data.position.y) return cached.geometry;
      const geometry = createNodeGeometry(
        data.node,
        data.position,
        undefined,
        this.nodePaletteIndex,
      );
      this.recipeNodeGeometryCache.set(data.node, {
        x: data.position.x,
        y: data.position.y,
        geometry,
      });
      return geometry;
    }
    return createNodeGeometry(
      data.node,
      data.position,
      data.visual,
      this.nodePaletteIndex,
      data.portPositions,
    );
  }

  private clearPerNodeBodies() {
    for (const body of this.perNodeBodies.values()) {
      this.nodeLayer.removeChild(body.container);
      body.batch.destroy();
      body.container.destroy({ children: true });
    }
    this.perNodeBodies.clear();
  }

  private syncPerNodeBodyOrder() {
    const ordered = bottommostRenderOrder(
      [...this.perNodeBodies.keys()].map((id) => ({
        id,
        order: this.nodes.get(id)?.order ?? -1,
        band: RENDER_BAND.nodeBody,
      })),
    );
    for (const { id } of ordered) {
      const container = this.perNodeBodies.get(id)?.container;
      if (container) this.nodeLayer.addChild(container);
    }
  }

  private rebuildEdges() {
    this.edgeGroups.clear();
    this.edgeGroupForId.clear();
    this.edgeGroupRepresentatives.clear();
    this.edgeBatchKeyById.clear();
    for (const [id, curve] of this.curves) {
      const edge = this.edges.get(id);
      if (!edge) continue;
      const key = edgeGroupKey(curve, edge);
      let group = this.edgeGroups.get(key);
      if (!group) this.edgeGroups.set(key, (group = new Set()));
      group.add(id);
      this.edgeGroupForId.set(id, key);
      this.edgeBatchKeyById.set(id, this.edgeBatchKey(edge));
      if (!this.edgeGroupRepresentatives.has(key)) this.edgeGroupRepresentatives.set(key, id);
    }
    const itemsByBatch = new Map<string, TriangleBatchItem[]>();
    const animatedItems: TriangleBatchItem[] = [];
    for (const id of this.edgeGroupRepresentatives.values()) {
      const edge = this.edges.get(id);
      const curve = this.curves.get(id);
      if (!edge || !curve) continue;
      const batchKey = this.edgeBatchKey(edge);
      this.edgeBatchFor(edge);
      const batchItems = itemsByBatch.get(batchKey) ?? [];
      batchItems.push(
        toBatchItem(id, this.createEdgeGeometry(curve, this.edgeLineWidth(this.edges.get(id)!))),
      );
      itemsByBatch.set(batchKey, batchItems);
      const geometry = this.createAnimatedGeometry(curve, edge.settings.animationStyle);
      if (geometry) animatedItems.push(toBatchItem(id, geometry));
    }
    for (const [key, batch] of this.edgeBatches) batch.rebuild(itemsByBatch.get(key) ?? []);
    this.animatedEdgeBatch.rebuild(animatedItems);
  }

  private findTopNode(group: ReadonlySet<string>) {
    let topNodeId = '';
    let topOrder = Number.NEGATIVE_INFINITY;
    for (const id of group) {
      const order = this.nodes.get(id)?.order ?? Number.NEGATIVE_INFINITY;
      if (order > topOrder) {
        topNodeId = id;
        topOrder = order;
      }
    }
    return topNodeId;
  }

  private wouldBreakDrawOrder(data: NodeRenderData) {
    if (data.order >= this.maxNodeOrder) return false;
    for (const current of this.nodes.values()) {
      if (current.node.id === data.node.id || current.order <= data.order) continue;
      if (nodeBoundsOverlap(current, data)) return true;
    }
    return false;
  }

  private updateSelectedEdge(curve: EdgeCurve) {
    if (!this.selectedEdgeId) return;
    const edge = this.edges.get(this.selectedEdgeId);
    if (edge) this.selectedEdgeBatch.setTexture(this.edgeTextureFor(edge));
    const geometry = this.createEdgeGeometry(curve, SELECTED_EDGE_STROKE_WIDTH);
    if (!this.selectedEdgeBatch.updateGeometry(this.selectedEdgeId, geometry)) {
      this.selectedEdgeBatch.rebuild([toBatchItem(this.selectedEdgeId, geometry)]);
    }
  }

  private rebuildSelectionOverlays() {
    const selectedNode = this.selectedNodeId ? this.nodes.get(this.selectedNodeId) : undefined;
    const selectedEdge = this.selectedEdgeId ? this.curves.get(this.selectedEdgeId) : undefined;
    this.selectedNodeBatch.rebuild(
      [...this.selectedNodeIds].flatMap((id) => {
        const node = this.nodes.get(id);
        return node ? [toBatchItem(node.node.id, createSelectedNodeGeometry(node))] : [];
      }),
    );
    if (selectedNode) this.updateSelectedPortHandles(selectedNode, true);
    else this.selectedPortHandlesBatch.rebuild([]);
    const selectedEdgeData = this.selectedEdgeId ? this.edges.get(this.selectedEdgeId) : undefined;
    this.selectedEdgeBatch.setTexture(
      selectedEdgeData ? this.edgeTextureFor(selectedEdgeData) : this.edgeTextures.solid,
    );
    this.selectedEdgeBatch.rebuild(
      selectedEdge && this.selectedEdgeId
        ? [
            toBatchItem(
              this.selectedEdgeId,
              this.createEdgeGeometry(selectedEdge, SELECTED_EDGE_STROKE_WIDTH),
            ),
          ]
        : [],
    );
  }

  private requestSelectionRebuild() {
    if (this.batchDepth > 0) this.selectionRebuildPending = true;
    else this.rebuildSelectionOverlays();
  }

  private updateSelectedPortHandles(selected: NodeRenderData, rebuild = false) {
    const geometry = createSelectedPortHandlesGeometry(selected);
    if (geometry.positions.length === 0) {
      if (this.selectedPortHandlesBatch.size > 0) this.selectedPortHandlesBatch.rebuild([]);
      return;
    }
    const item = toBatchItem(selected.node.id, geometry);
    if (rebuild || !this.selectedPortHandlesBatch.updateGeometry(selected.node.id, geometry)) {
      this.selectedPortHandlesBatch.rebuild([item]);
    }
  }

  private createEdgeGeometry(curve: EdgeCurve, lineWidth: number) {
    return this.getCachedEdgeGeometry(curve, lineWidth, EDGE_PATTERN_PERIOD);
  }

  private edgeLineWidth(edge: FlowEdge) {
    const width = (edge.settings as FlowEdge['settings'] & { readonly lineWidth?: number })
      .lineWidth;
    return width !== undefined && Number.isFinite(width) && width > 0 ? width : EDGE_STROKE_WIDTH;
  }

  private createAnimatedGeometry(curve: EdgeCurve, animationStyle: EdgeAnimationStyle) {
    if (animationStyle === 'pulse-arrow') {
      return this.getCachedEdgeGeometry(curve, 12, DIRECTION_ARROW_PERIOD);
    }
    return null;
  }

  private getCachedEdgeGeometry(curve: EdgeCurve, lineWidth: number, texturePeriod: number) {
    let geometries = this.edgeGeometryCache.get(curve);
    if (!geometries) this.edgeGeometryCache.set(curve, (geometries = new Map()));
    const key = `${lineWidth}:${texturePeriod}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = edgeGeometry(curve, lineWidth, texturePeriod);
      geometries.set(key, geometry);
    }
    return geometry;
  }

  private edgeBatchKey(edge: FlowEdge) {
    const settings = edge.settings as FlowEdge['settings'] & {
      readonly rendererColor?: number;
      readonly rendererAlpha?: number;
    };
    return this.makeEdgeBatchKey(
      edge.settings.lineStyle,
      edge.settings.animationStyle,
      settings.rendererColor ?? this.themeColors.edge,
      settings.rendererAlpha ?? 1,
    );
  }

  private makeEdgeBatchKey(
    lineStyle: EdgeLineStyle,
    animationStyle: EdgeAnimationStyle,
    color: number,
    alpha: number,
  ) {
    return color === this.themeColors.edge && alpha === 1
      ? `${lineStyle}:${animationStyle}`
      : `${lineStyle}:${animationStyle}:${color}:${alpha}`;
  }

  private edgeTextureFor(edge: FlowEdge) {
    return edge.settings.animationStyle === 'moving-dashes'
      ? this.animatedEdgeTextures[edge.settings.lineStyle]
      : this.edgeTextures[edge.settings.lineStyle];
  }

  private edgeBatchFor(edge: FlowEdge) {
    const key = this.edgeBatchKey(edge);
    let batch = this.edgeBatches.get(key);
    if (batch) return batch;
    const settings = edge.settings as FlowEdge['settings'] & {
      readonly rendererColor?: number;
      readonly rendererAlpha?: number;
    };
    const texture =
      edge.settings.animationStyle === 'moving-dashes'
        ? this.animatedEdgeTextures[edge.settings.lineStyle]
        : this.edgeTextures[edge.settings.lineStyle];
    batch = new TriangleMeshBatch(
      settings.rendererColor ?? this.themeColors.edge,
      texture,
      undefined,
      'no-batch',
    );
    batch.mesh.alpha = settings.rendererAlpha ?? 1;
    const selectionIndex = this.edgeLayer.getChildIndex(this.selectedEdgeBatch.mesh);
    this.edgeLayer.addChildAt(
      batch.mesh,
      selectionIndex < 0 ? this.edgeLayer.children.length : selectionIndex,
    );
    this.edgeBatches.set(key, batch);
    return batch;
  }

  private addAnimatedEdge(id: string, curve: EdgeCurve, animationStyle: EdgeAnimationStyle) {
    const geometry = this.createAnimatedGeometry(curve, animationStyle);
    if (geometry) this.animatedEdgeBatch.add(toBatchItem(id, geometry));
  }
}

export function createEdgeMeshGeometry(curve: EdgeCurve, lineWidth = EDGE_STROKE_WIDTH) {
  return edgeGeometry(curve, lineWidth, EDGE_PATTERN_PERIOD);
}

export function createNodeMeshGeometry(node: FlowNode, position: Point): TriangleGeometry {
  return createNodeGeometry(node, position);
}

export function getNodeMeshWidth() {
  return NODE_WIDTH;
}

export function getNodeMeshLabelPadding() {
  return IO_COLUMN_PADDING;
}
