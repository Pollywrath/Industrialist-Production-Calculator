import type { FlowGroup, GraphEdge, GraphNode } from '../domain/graph/types';
import type {
  GraphBounds,
  NodeVisualControl,
  NodeVisualDescription,
} from '../domain/graph/type-registry';
import type { EdgeCurve, Point } from '../canvas/renderer/edge-view';
import {
  compareRenderOrder,
  RENDER_BAND,
  type RenderBand,
  type RenderOrder,
} from '../canvas/renderer/render-order';

export interface ProjectedControl {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly bounds: GraphBounds;
}

interface ProjectedEntityBase extends RenderOrder {
  readonly bounds: GraphBounds;
}

export interface ProjectedNodeEntity extends ProjectedEntityBase {
  readonly kind: 'node' | 'collapsed-group';
  readonly node: GraphNode;
  readonly position: Point;
  readonly visual?: NodeVisualDescription;
  readonly hitShapes: readonly GraphBounds[];
  readonly controls: readonly ProjectedControl[];
}

export interface ProjectedGroupEntity extends ProjectedEntityBase {
  readonly kind: 'group';
  readonly group: FlowGroup;
  readonly visual?: NodeVisualDescription;
  readonly hitShapes: readonly GraphBounds[];
  readonly controls: readonly ProjectedControl[];
  readonly fillBand: typeof RENDER_BAND.groupFill;
  readonly selectedBand: typeof RENDER_BAND.selectedGroupChrome;
}

export interface ProjectedEdgeEntity extends ProjectedEntityBase {
  readonly kind: 'edge';
  readonly edge: GraphEdge;
  readonly curve: EdgeCurve;
  readonly points: readonly Point[];
}

export type ProjectedRenderEntity =
  | ProjectedNodeEntity
  | ProjectedGroupEntity
  | ProjectedEdgeEntity;

export interface ProjectedRenderPlanInput {
  readonly nodes: readonly ProjectedNodeEntity[];
  readonly groups: readonly ProjectedGroupEntity[];
  readonly edges: readonly ProjectedEdgeEntity[];
}

export interface ProjectedRenderPlanUpdates {
  readonly nodes: ReadonlyMap<string, ProjectedNodeEntity | null>;
  readonly groups: ReadonlyMap<string, ProjectedGroupEntity | null>;
  readonly edges: ReadonlyMap<string, ProjectedEdgeEntity | null>;
}

function isProjectedNode(entity: ProjectedRenderEntity): entity is ProjectedNodeEntity {
  return entity.kind === 'node' || entity.kind === 'collapsed-group';
}

function isProjectedEntity(entity: ProjectedRenderEntity): entity is ProjectedRenderEntity {
  return !!entity;
}

function orderedIndex<T extends ProjectedRenderEntity>(
  entities: readonly T[],
  entity: T | ProjectedRenderEntity,
) {
  let low = 0;
  let high = entities.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareRenderOrder(entities[middle], entity) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function applyOrderedUpdates<T extends ProjectedRenderEntity>(
  current: T[],
  updates: ReadonlyMap<string, T | null>,
  previousById: ReadonlyMap<string, ProjectedRenderEntity>,
  accepts: (entity: ProjectedRenderEntity) => entity is T,
) {
  if (updates.size === 0) return;
  let hasMembershipOrOrderChange = false;
  for (const [id, entity] of updates) {
    const previous = previousById.get(id);
    if (previous && accepts(previous)) {
      if (!entity || compareRenderOrder(previous, entity) !== 0) {
        hasMembershipOrOrderChange = true;
      } else {
        const index = orderedIndex(current, previous);
        if (current[index]?.id === id) current[index] = entity;
      }
    } else if (entity) hasMembershipOrOrderChange = true;
  }
  if (!hasMembershipOrOrderChange) return;

  const survivors: T[] = [];
  const additions: T[] = [];
  for (const currentEntity of current) {
    if (updates.has(currentEntity.id)) {
      const previous = previousById.get(currentEntity.id);
      const next = updates.get(currentEntity.id);
      if (previous && accepts(previous) && next) additions.push(next);
      else if (!previous || !accepts(previous)) survivors.push(currentEntity);
    } else {
      survivors.push(currentEntity);
    }
  }
  for (const [id, entity] of updates) {
    const previous = previousById.get(id);
    if (entity && (!previous || !accepts(previous))) additions.push(entity);
  }
  additions.sort(compareRenderOrder);

  const merged: T[] = [];
  let survivorIndex = 0;
  let additionIndex = 0;
  while (survivorIndex < survivors.length && additionIndex < additions.length) {
    if (compareRenderOrder(survivors[survivorIndex], additions[additionIndex]) <= 0) {
      merged.push(survivors[survivorIndex++]);
    } else {
      merged.push(additions[additionIndex++]);
    }
  }
  while (survivorIndex < survivors.length) merged.push(survivors[survivorIndex++]);
  while (additionIndex < additions.length) merged.push(additions[additionIndex++]);
  current.length = 0;
  current.push(...merged);
}

function pointInBounds(point: Point, bounds: GraphBounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function containsEntityPoint(point: Point, entity: ProjectedNodeEntity | ProjectedGroupEntity) {
  const localPoint =
    'position' in entity
      ? { x: point.x - entity.position.x, y: point.y - entity.position.y }
      : { x: point.x - entity.bounds.x, y: point.y - entity.bounds.y };
  const shapes = entity.hitShapes;
  return shapes.length === 0
    ? pointInBounds(point, entity.bounds)
    : shapes.some((shape) => pointInBounds(localPoint, shape));
}

function toProjectedControl(control: NodeVisualControl): ProjectedControl {
  return { id: control.id, label: control.label, action: control.action, bounds: control.bounds };
}

export class ProjectedRenderPlan {
  readonly entities: readonly ProjectedRenderEntity[];
  readonly nodes: readonly ProjectedNodeEntity[];
  readonly groups: readonly ProjectedGroupEntity[];
  readonly edges: readonly ProjectedEdgeEntity[];
  private readonly byId: ReadonlyMap<string, ProjectedRenderEntity>;

  constructor(input: ProjectedRenderPlanInput) {
    this.nodes = [...input.nodes].sort(compareRenderOrder);
    this.groups = [...input.groups].sort(compareRenderOrder);
    this.edges = [...input.edges].sort(compareRenderOrder);
    this.entities = [...this.nodes, ...this.groups, ...this.edges].sort(compareRenderOrder);
    this.byId = new Map(this.entities.map((entity) => [entity.id, entity]));
  }

  applyUpdates(updates: ProjectedRenderPlanUpdates) {
    const nodes = this.nodes as ProjectedNodeEntity[];
    const groups = this.groups as ProjectedGroupEntity[];
    const edges = this.edges as ProjectedEdgeEntity[];
    const entities = this.entities as ProjectedRenderEntity[];
    const byId = this.byId as Map<string, ProjectedRenderEntity>;
    const previousById = this.byId;

    applyOrderedUpdates(nodes, updates.nodes, previousById, isProjectedNode);
    applyOrderedUpdates(
      groups,
      updates.groups,
      previousById,
      (entity): entity is ProjectedGroupEntity => entity.kind === 'group',
    );
    applyOrderedUpdates(
      edges,
      updates.edges,
      previousById,
      (entity): entity is ProjectedEdgeEntity => entity.kind === 'edge',
    );
    const allUpdates = new Map<string, ProjectedRenderEntity | null>();
    for (const [id, entity] of updates.nodes) {
      const previous = previousById.get(id);
      if (entity || (previous && isProjectedNode(previous))) allUpdates.set(id, entity);
    }
    for (const [id, entity] of updates.groups) {
      if (entity || previousById.get(id)?.kind === 'group') allUpdates.set(id, entity);
    }
    for (const [id, entity] of updates.edges) {
      if (entity || previousById.get(id)?.kind === 'edge') allUpdates.set(id, entity);
    }
    applyOrderedUpdates(entities, allUpdates, previousById, isProjectedEntity);
    for (const [id, entity] of allUpdates) {
      if (entity) byId.set(id, entity);
      else byId.delete(id);
    }
  }

  get(id: string) {
    return this.byId.get(id);
  }

  getNode(id: string) {
    const entity = this.byId.get(id);
    return entity && (entity.kind === 'node' || entity.kind === 'collapsed-group')
      ? entity
      : undefined;
  }

  getGroup(id: string) {
    const entity = this.byId.get(id);
    return entity?.kind === 'group' ? entity : undefined;
  }

  getEdge(id: string) {
    const entity = this.byId.get(id);
    return entity?.kind === 'edge' ? entity : undefined;
  }

  nodeAtPoint(point: Point) {
    return [...this.nodes].reverse().find((entity) => containsEntityPoint(point, entity)) ?? null;
  }

  groupAtPoint(point: Point) {
    return [...this.groups].reverse().find((entity) => containsEntityPoint(point, entity)) ?? null;
  }

  topmostAtPoint(point: Point, selectedGroupId?: string) {
    const candidates: {
      readonly entity: ProjectedNodeEntity | ProjectedGroupEntity;
      readonly band: RenderBand;
    }[] = [];
    for (const entity of this.nodes)
      if (containsEntityPoint(point, entity)) candidates.push({ entity, band: entity.band });
    for (const entity of this.groups) {
      if (!containsEntityPoint(point, entity)) continue;
      candidates.push({
        entity,
        band: entity.id === selectedGroupId ? entity.selectedBand : entity.band,
      });
    }
    candidates.sort((left, right) =>
      compareRenderOrder(
        { band: left.band, order: left.entity.order, id: left.entity.id },
        { band: right.band, order: right.entity.order, id: right.entity.id },
      ),
    );
    return candidates.at(-1)?.entity ?? null;
  }

  controlAtPoint(point: Point, selectedGroupId?: string) {
    const topmost = this.topmostAtPoint(point, selectedGroupId);
    if (!topmost) return null;
    const candidates: {
      readonly entity: ProjectedNodeEntity | ProjectedGroupEntity;
      readonly control: ProjectedControl;
      readonly band: RenderBand;
    }[] = [];
    for (const entity of this.nodes) {
      if (entity !== topmost) continue;
      const localPoint = { x: point.x - entity.position.x, y: point.y - entity.position.y };
      for (const control of entity.controls) {
        if (pointInBounds(localPoint, control.bounds))
          candidates.push({ entity, control, band: entity.band });
      }
    }
    for (const entity of this.groups) {
      if (entity !== topmost || (selectedGroupId && entity.id !== selectedGroupId)) continue;
      const localPoint = { x: point.x - entity.bounds.x, y: point.y - entity.bounds.y };
      for (const control of entity.controls) {
        if (pointInBounds(localPoint, control.bounds)) {
          candidates.push({
            entity,
            control,
            band: entity.id === selectedGroupId ? entity.selectedBand : entity.band,
          });
        }
      }
    }
    candidates.sort((left, right) =>
      compareRenderOrder(
        { band: left.band, order: left.entity.order, id: left.entity.id },
        { band: right.band, order: right.entity.order, id: right.entity.id },
      ),
    );
    const candidate = candidates.at(-1);
    return candidate ? { ...candidate, entity: candidate.entity } : null;
  }
}

export function createProjectedControls(
  visual: NodeVisualDescription | undefined,
): readonly ProjectedControl[] {
  return visual?.controls.map(toProjectedControl) ?? [];
}

export function createEmptyProjectedRenderPlan() {
  return new ProjectedRenderPlan({ nodes: [], groups: [], edges: [] });
}

export function makeProjectedNodeEntity(
  input: Omit<ProjectedNodeEntity, 'band'> & { readonly band?: RenderBand },
): ProjectedNodeEntity {
  return { ...input, band: input.band ?? RENDER_BAND.nodeBody };
}
