import { Texture } from 'pixi.js';
import type { RecipeNode as FlowNode } from '../../../domain/nodes/recipe/model';
import {
  BASE_INFO_HEIGHT,
  NODE_BORDER_WIDTH,
  NODE_HEADER_DIVIDER_INSET,
  PORT_ROW_BORDER_WIDTH,
  PORT_HANDLE_SIZE,
  PORT_ROW_RADIUS,
  getOrderedPorts,
  getPortPosition,
  getPortRowBounds,
  getRecipeNodeSize,
} from '../../../domain/nodes/recipe/geometry';
import { getThemeColorCss, THEME_COLOR } from '../../../theme/theme-colors';
import type { Point } from '../edge-view';
import type { TriangleGeometry } from '../mesh-batch';
import type {
  NodeVisualDescription,
  NodeVisualShape,
  VisualPaint,
} from '../../../domain/graph/type-registry';
export interface NodeRenderData {
  readonly node: FlowNode;
  readonly position: Point;
  readonly order: number;
  readonly visual?: NodeVisualDescription;
  readonly portPositions?: ReadonlyMap<string, Point>;
}

const NODE_PALETTE_VARIABLES = [
  THEME_COLOR.nodeBackground,
  THEME_COLOR.inputBackground,
  THEME_COLOR.outputBackground,
  THEME_COLOR.nodeBorder,
  THEME_COLOR.divider,
  THEME_COLOR.inputBorder,
  THEME_COLOR.outputBorder,
  THEME_COLOR.inputPort,
  THEME_COLOR.outputPort,
  THEME_COLOR.portBorder,
  THEME_COLOR.buttonBackground,
  THEME_COLOR.buttonBorder,
  THEME_COLOR.buttonDots,
  THEME_COLOR.nodeTargetBackground,
  THEME_COLOR.nodeTargetBorder,
  THEME_COLOR.inputPortDeficient,
  THEME_COLOR.outputPortExcess,
] as const;

const nodePaletteTextures = new Map<string, Texture>();
const NODE_PALETTE_SIZE = 256;

export interface NodePalette {
  readonly texture: Texture;
  indexOf(paint: VisualPaint): number;
}

function resolvePaint(paint: VisualPaint): string {
  if (typeof paint === 'number')
    return `#${Math.max(0, paint >>> 0)
      .toString(16)
      .padStart(6, '0')
      .slice(-6)}`;
  const themeEntry = Object.entries(THEME_COLOR).find(
    ([name, value]) => name === paint || value === paint,
  );
  if (themeEntry) return getThemeColorCss(themeEntry[1]);
  return paint;
}

export function createNodePaletteTexture() {
  const colors = NODE_PALETTE_VARIABLES.map(getThemeColorCss);
  const cacheKey = colors.join('\u0000');
  const cached = nodePaletteTextures.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = NODE_PALETTE_SIZE;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the node color palette.');
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index, 0, 1, 1);
  });
  context.fillStyle = colors[0];
  context.fillRect(
    NODE_PALETTE_VARIABLES.length,
    0,
    NODE_PALETTE_SIZE - NODE_PALETTE_VARIABLES.length,
    1,
  );
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  nodePaletteTextures.set(cacheKey, texture);
  return texture;
}

export function createNodePalette(): NodePalette {
  const colors = NODE_PALETTE_VARIABLES.map(getThemeColorCss);
  const canvas = document.createElement('canvas');
  canvas.width = NODE_PALETTE_SIZE;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not update the node color palette.');
  context.fillStyle = colors[0];
  context.fillRect(0, 0, NODE_PALETTE_SIZE, 1);
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index, 0, 1, 1);
  });
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  const paintIndexes = new Map<string, number>();
  const themeEntries = Object.entries(THEME_COLOR);
  for (const [index, variable] of NODE_PALETTE_VARIABLES.entries()) {
    paintIndexes.set(variable, index);
    const named = themeEntries.find(([, value]) => value === variable)?.[0];
    if (named) paintIndexes.set(named, index);
  }
  let nextIndex = NODE_PALETTE_VARIABLES.length;
  return {
    texture,
    indexOf(paint) {
      const key = String(paint);
      const known = paintIndexes.get(key);
      if (known !== undefined) return known;
      const cssColor = resolvePaint(paint);
      const cssKey = `css:${cssColor}`;
      const existing = paintIndexes.get(cssKey);
      if (existing !== undefined) {
        paintIndexes.set(key, existing);
        return existing;
      }
      if (nextIndex >= NODE_PALETTE_SIZE) return 0;
      const index = nextIndex++;
      context.fillStyle = cssColor;
      context.fillRect(index, 0, 1, 1);
      texture.source.update();
      paintIndexes.set(cssKey, index);
      paintIndexes.set(key, index);
      return index;
    },
  };
}

function mergeGeometries(geometries: readonly TriangleGeometry[]): TriangleGeometry {
  const positionLength = geometries.reduce((sum, geometry) => sum + geometry.positions.length, 0);
  const indexLength = geometries.reduce((sum, geometry) => sum + geometry.indices.length, 0);
  const positions = new Float32Array(positionLength);
  const hasUvs = geometries.some((geometry) => geometry.uvs !== undefined);
  const uvs = hasUvs ? new Float32Array(positionLength) : undefined;
  const indices = new Uint32Array(indexLength);
  let positionOffset = 0;
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    positions.set(geometry.positions, positionOffset);
    if (geometry.uvs && uvs) uvs.set(geometry.uvs, positionOffset);
    for (let index = 0; index < geometry.indices.length; index++) {
      indices[indexOffset + index] = geometry.indices[index] + vertexOffset;
    }
    positionOffset += geometry.positions.length;
    vertexOffset += geometry.positions.length / 2;
    indexOffset += geometry.indices.length;
  }
  return { positions, ...(uvs ? { uvs } : {}), indices };
}

function mergeColoredGeometries(
  geometries: readonly { readonly geometry: TriangleGeometry; readonly colorIndex: number }[],
): TriangleGeometry {
  const positionLength = geometries.reduce((sum, item) => sum + item.geometry.positions.length, 0);
  const indexLength = geometries.reduce((sum, item) => sum + item.geometry.indices.length, 0);
  const positions = new Float32Array(positionLength);
  const uvs = new Float32Array(positionLength);
  const indices = new Uint32Array(indexLength);
  let positionOffset = 0;
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const { geometry, colorIndex } of geometries) {
    positions.set(geometry.positions, positionOffset);
    const u = (colorIndex + 0.5) / NODE_PALETTE_SIZE;
    for (let index = 0; index < geometry.positions.length; index += 2) {
      uvs[positionOffset + index] = u;
      uvs[positionOffset + index + 1] = 0.5;
    }
    for (let index = 0; index < geometry.indices.length; index++) {
      indices[indexOffset + index] = geometry.indices[index] + vertexOffset;
    }
    positionOffset += geometry.positions.length;
    vertexOffset += geometry.positions.length / 2;
    indexOffset += geometry.indices.length;
  }
  return { positions, uvs, indices };
}

function rectangle(x: number, y: number, width: number, height: number): TriangleGeometry {
  return {
    positions: new Float32Array([x, y, x + width, y, x + width, y + height, x, y + height]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function roundedRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): TriangleGeometry {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const corners = [
    { x: x + r, y: y + r, start: Math.PI },
    { x: x + width - r, y: y + r, start: Math.PI * 1.5 },
    { x: x + width - r, y: y + height - r, start: 0 },
    { x: x + r, y: y + height - r, start: Math.PI * 0.5 },
  ];
  const boundary: number[] = [];
  for (const corner of corners) {
    for (let step = 0; step <= 4; step++) {
      const angle = corner.start + Math.PI * 0.5 * (step / 4);
      boundary.push(corner.x + Math.cos(angle) * r, corner.y + Math.sin(angle) * r);
    }
  }
  const centerIndex = boundary.length / 2;
  const positions = new Float32Array([x + width / 2, y + height / 2, ...boundary]);
  const indices: number[] = [];
  for (let index = 0; index < centerIndex; index++) {
    const next = (index + 1) % centerIndex;
    indices.push(0, index + 1, next + 1);
  }
  return { positions, indices: new Uint32Array(indices) };
}

function roundedRectangleRing(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  radius: number,
): TriangleGeometry {
  const outer = roundedRectangle(x, y, width, height, radius).positions.slice(2);
  const inner = roundedRectangle(
    x + thickness,
    y + thickness,
    width - thickness * 2,
    height - thickness * 2,
    Math.max(0, radius - thickness),
  ).positions.slice(2);
  const positions = new Float32Array(outer.length + inner.length);
  positions.set(outer);
  positions.set(inner, outer.length);
  const count = outer.length / 2;
  const indices: number[] = [];
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const innerStart = count + index;
    const innerNext = count + next;
    indices.push(index, next, innerNext, index, innerNext, innerStart);
  }
  return { positions, indices: new Uint32Array(indices) };
}

function filledCircle(x: number, y: number, radius: number, segments = 10): TriangleGeometry {
  const positions = [x, y];
  const indices: number[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    positions.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    indices.push(0, index + 1, ((index + 1) % segments) + 1);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function circleRing(
  x: number,
  y: number,
  radius: number,
  thickness: number,
  segments = 16,
): TriangleGeometry {
  const innerRadius = Math.max(0, radius - thickness);
  const positions = new Float32Array(segments * 4);
  const indices: number[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const outerOffset = index * 4;
    positions[outerOffset] = x + Math.cos(angle) * radius;
    positions[outerOffset + 1] = y + Math.sin(angle) * radius;
    positions[outerOffset + 2] = x + Math.cos(angle) * innerRadius;
    positions[outerOffset + 3] = y + Math.sin(angle) * innerRadius;

    const next = (index + 1) % segments;
    const outer = index * 2;
    const inner = outer + 1;
    const nextOuter = next * 2;
    const nextInner = nextOuter + 1;
    indices.push(outer, nextOuter, nextInner, outer, nextInner, inner);
  }
  return { positions, indices: new Uint32Array(indices) };
}

function createPortHandleGeometry(center: Point, kind: 'item' | 'fluid' | undefined) {
  const radius = PORT_HANDLE_SIZE / 2;
  if (kind === 'fluid') {
    return {
      handle: filledCircle(center.x, center.y, radius, 16),
      border: circleRing(center.x, center.y, radius, 2),
    };
  }

  const x = center.x - radius;
  const y = center.y - radius;
  return {
    handle: roundedRectangle(x, y, PORT_HANDLE_SIZE, PORT_HANDLE_SIZE, 2),
    border: roundedRectangleRing(x, y, PORT_HANDLE_SIZE, PORT_HANDLE_SIZE, 2, 2),
  };
}

export function createNodeGeometry(
  node: FlowNode,
  position: Point,
  visual?: NodeVisualDescription,
  paletteIndex: (paint: VisualPaint) => number = () => 0,
  portPositions?: ReadonlyMap<string, Point>,
): TriangleGeometry {
  if (visual) {
    const localGeometry = createDeclarativeNodeGeometry(visual, paletteIndex);
    const translated = new Float32Array(localGeometry.positions.length);
    for (let index = 0; index < localGeometry.positions.length; index += 2) {
      translated[index] = localGeometry.positions[index] + position.x;
      translated[index + 1] = localGeometry.positions[index + 1] + position.y;
    }
    const entries: TriangleGeometry[] = [{ ...localGeometry, positions: translated }];
    const inputHandles: TriangleGeometry[] = [];
    const deficientInputHandles: TriangleGeometry[] = [];
    const outputHandles: TriangleGeometry[] = [];
    const excessOutputHandles: TriangleGeometry[] = [];
    const borders: TriangleGeometry[] = [];
    for (const port of node.ports) {
      const anchor = portPositions?.get(port.id);
      if (!anchor) continue;
      const center = {
        x:
          position.x +
          anchor.x +
          (port.direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH),
        y: position.y + anchor.y,
      };
      const handles = createPortHandleGeometry(center, port.kind);
      if (port.direction === 'input') {
        if (port.status === 'deficient') deficientInputHandles.push(handles.handle);
        else inputHandles.push(handles.handle);
      } else if (port.status === 'excess') excessOutputHandles.push(handles.handle);
      else outputHandles.push(handles.handle);
      borders.push(handles.border);
    }
    entries.push(
      mergeColoredGeometries([
        { geometry: mergeGeometries(inputHandles), colorIndex: 7 },
        { geometry: mergeGeometries(outputHandles), colorIndex: 8 },
        { geometry: mergeGeometries(deficientInputHandles), colorIndex: 15 },
        { geometry: mergeGeometries(excessOutputHandles), colorIndex: 16 },
        { geometry: mergeGeometries(borders), colorIndex: 9 },
      ]),
    );
    return mergeGeometries(entries);
  }
  const { width, height } = getRecipeNodeSize(node);
  const body = roundedRectangle(position.x, position.y, width, height, 12);
  const inputRows: TriangleGeometry[] = [];
  const outputRows: TriangleGeometry[] = [];
  const inputBorders: TriangleGeometry[] = [];
  const outputBorders: TriangleGeometry[] = [];
  const portBorders: TriangleGeometry[] = [];
  const inputPorts: TriangleGeometry[] = [];
  const deficientInputPorts: TriangleGeometry[] = [];
  const outputPorts: TriangleGeometry[] = [];
  const excessOutputPorts: TriangleGeometry[] = [];
  for (const direction of ['input', 'output'] as const) {
    for (const port of getOrderedPorts(node, direction)) {
      const anchor = getPortPosition(node, port.id);
      const rowBounds = getPortRowBounds(node, port.id);
      if (!anchor || !rowBounds) continue;
      const rowX = position.x + rowBounds.x;
      const rowY = position.y + rowBounds.y;
      const row = roundedRectangle(rowX, rowY, rowBounds.width, rowBounds.height, PORT_ROW_RADIUS);
      const rowBorder = roundedRectangleRing(
        rowX,
        rowY,
        rowBounds.width,
        rowBounds.height,
        PORT_ROW_BORDER_WIDTH,
        PORT_ROW_RADIUS,
      );
      const handleCenterX =
        position.x + anchor.x + (direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH);
      const handleCenterY = position.y + anchor.y;
      const { handle, border: handleBorder } = createPortHandleGeometry(
        { x: handleCenterX, y: handleCenterY },
        port.kind,
      );
      if (direction === 'input') {
        inputRows.push(row);
        inputBorders.push(rowBorder);
        if (port.status === 'deficient') deficientInputPorts.push(handle);
        else inputPorts.push(handle);
      } else {
        outputRows.push(row);
        outputBorders.push(rowBorder);
        if (port.status === 'excess') excessOutputPorts.push(handle);
        else outputPorts.push(handle);
      }
      portBorders.push(handleBorder);
    }
  }

  const buttonX = position.x + width - 34;
  const buttonY = position.y + 10;
  const buttonFill = roundedRectangle(buttonX, buttonY, 24, 24, 6);
  const buttonBorder = roundedRectangleRing(buttonX, buttonY, 24, 24, 1, 6);
  const buttonDots = mergeGeometries([
    filledCircle(buttonX + 8, buttonY + 12, 1.15),
    filledCircle(buttonX + 12, buttonY + 12, 1.15),
    filledCircle(buttonX + 16, buttonY + 12, 1.15),
  ]);
  const nodeBorder = roundedRectangleRing(
    position.x + 1,
    position.y + 1,
    width - 2,
    height - 2,
    NODE_BORDER_WIDTH,
    11,
  );
  const headerDivider = rectangle(
    position.x + NODE_HEADER_DIVIDER_INSET,
    position.y + BASE_INFO_HEIGHT - 0.5,
    width - NODE_HEADER_DIVIDER_INSET * 2,
    1,
  );

  return mergeColoredGeometries([
    { geometry: body, colorIndex: node.data.isTarget ? 13 : 0 },
    { geometry: mergeGeometries(inputRows), colorIndex: 1 },
    { geometry: mergeGeometries(outputRows), colorIndex: 2 },
    { geometry: nodeBorder, colorIndex: node.data.isTarget ? 14 : 3 },
    { geometry: headerDivider, colorIndex: 4 },
    { geometry: mergeGeometries(inputBorders), colorIndex: 5 },
    { geometry: mergeGeometries(outputBorders), colorIndex: 6 },
    { geometry: buttonFill, colorIndex: 10 },
    { geometry: buttonBorder, colorIndex: 11 },
    { geometry: buttonDots, colorIndex: 12 },
    { geometry: mergeGeometries(inputPorts), colorIndex: 7 },
    { geometry: mergeGeometries(outputPorts), colorIndex: 8 },
    { geometry: mergeGeometries(deficientInputPorts), colorIndex: 15 },
    { geometry: mergeGeometries(excessOutputPorts), colorIndex: 16 },
    { geometry: mergeGeometries(portBorders), colorIndex: 9 },
  ]);
}

function polygonGeometry(points: readonly Point[]): TriangleGeometry {
  if (points.length < 3) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const center = points.reduce(
    (result, point) => ({
      x: result.x + point.x / points.length,
      y: result.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );
  const positions = new Float32Array([
    center.x,
    center.y,
    ...points.flatMap((point) => [point.x, point.y]),
  ]);
  const indices: number[] = [];
  for (let index = 0; index < points.length; index++)
    indices.push(0, index + 1, ((index + 1) % points.length) + 1);
  return { positions, indices: new Uint32Array(indices) };
}

function lineSegment(start: Point, end: Point, width: number): TriangleGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = ((-dy / length) * width) / 2;
  const ny = ((dx / length) * width) / 2;
  return {
    positions: new Float32Array([
      start.x + nx,
      start.y + ny,
      end.x + nx,
      end.y + ny,
      end.x - nx,
      end.y - ny,
      start.x - nx,
      start.y - ny,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

function shapeGeometry(shape: NodeVisualShape, stroke = false): TriangleGeometry {
  if (shape.kind === 'rect' || shape.kind === 'round-rect') {
    const { x, y, width, height } = shape.bounds;
    return stroke
      ? roundedRectangleRing(
          x,
          y,
          width,
          height,
          shape.strokeWidth ?? 1,
          shape.kind === 'round-rect' ? (shape.radius ?? 6) : 0,
        )
      : shape.kind === 'round-rect'
        ? roundedRectangle(x, y, width, height, shape.radius ?? 6)
        : rectangle(x, y, width, height);
  }
  if (shape.kind === 'circle') {
    return stroke
      ? circleRing(shape.centerX, shape.centerY, shape.radius, shape.strokeWidth ?? 1)
      : filledCircle(shape.centerX, shape.centerY, shape.radius, 24);
  }
  if (shape.kind === 'polygon') {
    return stroke
      ? mergeGeometries(
          shape.points.map((point, index) =>
            lineSegment(
              point,
              shape.points[(index + 1) % shape.points.length],
              shape.strokeWidth ?? 1,
            ),
          ),
        )
      : polygonGeometry(shape.points);
  }
  return { positions: new Float32Array(0), indices: new Uint32Array(0) };
}

export function createDeclarativeNodeGeometry(
  visual: NodeVisualDescription,
  paletteIndex: (paint: VisualPaint) => number,
): TriangleGeometry {
  const entries: { geometry: TriangleGeometry; colorIndex: number }[] = [];
  for (const shape of visual.shapes) {
    if (shape.fill !== undefined)
      entries.push({ geometry: shapeGeometry(shape), colorIndex: paletteIndex(shape.fill) });
    if (shape.stroke !== undefined)
      entries.push({
        geometry: shapeGeometry(shape, true),
        colorIndex: paletteIndex(shape.stroke),
      });
  }
  for (const control of visual.controls) {
    const shape: NodeVisualShape = {
      kind: control.shape ?? 'round-rect',
      bounds: control.bounds,
      ...(control.shape === 'circle'
        ? {
            kind: 'circle' as const,
            centerX: control.bounds.x + control.bounds.width / 2,
            centerY: control.bounds.y + control.bounds.height / 2,
            radius: Math.min(control.bounds.width, control.bounds.height) / 2,
          }
        : {}),
      fill: control.fill ?? 'buttonBackground',
      stroke: control.stroke ?? 'buttonBorder',
      strokeWidth: 1,
      radius: 5,
    } as NodeVisualShape;
    entries.push({ geometry: shapeGeometry(shape), colorIndex: paletteIndex(shape.fill!) });
    entries.push({ geometry: shapeGeometry(shape, true), colorIndex: paletteIndex(shape.stroke!) });
  }
  return mergeColoredGeometries(entries);
}

export function createSelectedNodeGeometry(data: NodeRenderData): TriangleGeometry {
  const { width, height } = data.visual?.bounds ?? getRecipeNodeSize(data.node);
  return roundedRectangleRing(
    data.position.x - 3,
    data.position.y - 3,
    width + 6,
    height + 6,
    2,
    15,
  );
}

export function createSelectedPortHandlesGeometry(data: NodeRenderData): TriangleGeometry {
  const inputHandles: TriangleGeometry[] = [];
  const deficientInputHandles: TriangleGeometry[] = [];
  const outputHandles: TriangleGeometry[] = [];
  const excessOutputHandles: TriangleGeometry[] = [];
  const borders: TriangleGeometry[] = [];
  for (const direction of ['input', 'output'] as const) {
    for (const port of getOrderedPorts(data.node, direction)) {
      const anchor = data.portPositions?.get(port.id) ?? getPortPosition(data.node, port.id);
      if (!anchor) continue;
      const center = {
        x:
          data.position.x +
          anchor.x +
          (direction === 'input' ? NODE_BORDER_WIDTH : -NODE_BORDER_WIDTH),
        y: data.position.y + anchor.y,
      };
      const { handle, border } = createPortHandleGeometry(center, port.kind);
      if (direction === 'input') {
        if (port.status === 'deficient') deficientInputHandles.push(handle);
        else inputHandles.push(handle);
      } else if (port.status === 'excess') excessOutputHandles.push(handle);
      else outputHandles.push(handle);
      borders.push(border);
    }
  }
  return mergeColoredGeometries([
    { geometry: mergeGeometries(inputHandles), colorIndex: 7 },
    { geometry: mergeGeometries(outputHandles), colorIndex: 8 },
    { geometry: mergeGeometries(deficientInputHandles), colorIndex: 15 },
    { geometry: mergeGeometries(excessOutputHandles), colorIndex: 16 },
    { geometry: mergeGeometries(borders), colorIndex: 9 },
  ]);
}
