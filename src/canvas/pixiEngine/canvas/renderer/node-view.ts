import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import {
  NODE_BORDER_WIDTH,
  NODE_INFO_SIDE_PADDING,
  NODE_WIDTH,
  PORT_ROW_HEIGHT,
  getOrderedPorts,
  getPortColumnLayout,
  getPortPosition,
  getRecipeNodeSize,
} from '../../domain/nodes/recipe/geometry';
import type { RecipeNode as FlowNode } from '../../domain/nodes/recipe/model';
import {
  getCanvasThemeColors,
  getThemeColor,
  parseThemeColorCss,
  THEME_COLOR,
} from '../../theme/theme-colors';
import { formatMachineCount } from '../../../../utils/unitFormatting';
import { wrapTextWithEllipsis } from './text-layout';

const MIN_NODE_DETAIL_ZOOM = 0.4;
export const NODE_TEXT_RESOLUTION_SCALE = 2;
const NODE_FONT_FAMILY = `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif`;
const NODE_TITLE_HORIZONTAL_PADDING = 65;
const NODE_TITLE_TOP = 15;
const NODE_TITLE_LINE_HEIGHT = 18;
const NODE_TITLE_MARGIN_BOTTOM = 12;
const NODE_HEADER_STATS_GAP = 12;
const NODE_HEADER_STATS_MIN_HEIGHT = 65;
const NODE_HEADER_STAT_LINE_HEIGHT = 13;
const NODE_HEADER_STAT_ROW_COUNT = 3;
const NODE_HEADER_STAT_LABEL_SIZE = 11;
const NODE_HEADER_MACHINE_NAME_SIZE = 13;
const NODE_HEADER_MACHINE_NAME_LINE_HEIGHT = 15.6;
const NODE_HEADER_MACHINE_COUNT_SIZE = 20;
const NODE_HEADER_MACHINE_COUNT_LINE_HEIGHT = 20;
export const COLLAPSED_GROUP_EXPAND_BUTTON = {
  x: NODE_WIDTH - 180,
  y: 52,
  width: 164,
  height: 64,
} as const;

export function isInsideCollapsedGroupExpandButton(x: number, y: number) {
  return (
    x >= COLLAPSED_GROUP_EXPAND_BUTTON.x &&
    x <= COLLAPSED_GROUP_EXPAND_BUTTON.x + COLLAPSED_GROUP_EXPAND_BUTTON.width &&
    y >= COLLAPSED_GROUP_EXPAND_BUTTON.y &&
    y <= COLLAPSED_GROUP_EXPAND_BUTTON.y + COLLAPSED_GROUP_EXPAND_BUTTON.height
  );
}
const PORT_LABEL_HORIZONTAL_PADDING = 8;
const PORT_LABEL_VERTICAL_PADDING = 4;
const PORT_LABEL_LINE_HEIGHT = 15.6;
const PORT_LABEL_MAX_LINES = Math.floor(
  (PORT_ROW_HEIGHT - PORT_LABEL_VERTICAL_PADDING * 2) / PORT_LABEL_LINE_HEIGHT,
);
const sharedTextStyles = new Map<string, TextStyle>();
let nodeTextMeasureContext: CanvasRenderingContext2D | null | undefined;
const nodeTextWidthCache = new Map<string, number>();

function getSharedTextStyle(options: Partial<TextStyleOptions>) {
  const key = JSON.stringify(options);
  let style = sharedTextStyles.get(key);
  if (!style) {
    style = new TextStyle(options);
    sharedTextStyles.set(key, style);
  }
  return style;
}

export function getNodeHeaderColumnWidths(statsWidth: number, naturalLeftWidth: number) {
  const minimumLeftWidth = Math.max(0, (statsWidth - NODE_HEADER_STATS_GAP) / 2);
  const maximumLeftWidth = statsWidth * 0.62;
  const left = Math.min(maximumLeftWidth, Math.max(minimumLeftWidth, naturalLeftWidth));
  return { left, right: Math.max(0, statsWidth - left - NODE_HEADER_STATS_GAP) };
}

function getEvenlySpacedRowCenters(top: number, height: number, rowHeight: number, count: number) {
  const gap = Math.max(0, (height - rowHeight * count) / (count + 1));
  return Array.from(
    { length: count },
    (_, index) => top + gap * (index + 1) + rowHeight * index + rowHeight / 2,
  );
}

function measureNodeTextWidth(text: string, fontSize: number, fontWeight: number) {
  const key = `${fontWeight}:${fontSize}:${text}`;
  const cached = nodeTextWidthCache.get(key);
  if (cached !== undefined) return cached;
  if (nodeTextMeasureContext === undefined) {
    nodeTextMeasureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!nodeTextMeasureContext) return text.length * fontSize * 0.55;
  nodeTextMeasureContext.font = `${fontWeight} ${fontSize}px ${NODE_FONT_FAMILY}`;
  const width = nodeTextMeasureContext.measureText(text).width;
  nodeTextWidthCache.set(key, width);
  return width;
}

function fitNodeTitle(text: string, maxWidth: number) {
  if (measureNodeTextWidth(text, 15, 700) <= maxWidth) return text;

  const characters = Array.from(text);
  const ellipsis = '…';
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join('')}${ellipsis}`;
    if (measureNodeTextWidth(candidate, 15, 700) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${characters.slice(0, low).join('')}${ellipsis}`;
}

export interface NodeView {
  readonly container: Container;
  readonly textContainer: Container;
  readonly controlContainer: Container;
  overlapMask: Graphics | null;
  controlMask: Graphics | null;
  node: FlowNode;
  nodeId: string;
  collapsedGroup: boolean;
  title: Text | null;
  summary: Text[] | null;
  machineName: Text | null;
  machineCount: Text | null;
  expandButton: Container | null;
  readonly portLabels: Text[];
  readonly statusBadges: Container[];
  portsBuilt: boolean;
}

export const NODE_VIEW_POOL_LIMIT = 128;

export function retainNodeView(pool: NodeView[], view: NodeView) {
  if (pool.length >= NODE_VIEW_POOL_LIMIT) {
    view.container.destroy({ children: true });
    return false;
  }
  pool.push(view);
  return true;
}

export interface NodeTextVisibility {
  readonly title: boolean;
  readonly summary: boolean;
  readonly ports: boolean;
}

export function getNodeTextVisibility(
  zoom: number,
  highlighted = false,
  forceDetails = false,
): NodeTextVisibility {
  const showDetails = forceDetails || zoom >= MIN_NODE_DETAIL_ZOOM;
  return {
    title: highlighted || showDetails,
    summary: showDetails,
    ports: showDetails,
  };
}

export function createNodeView(
  node: FlowNode,
  collapsedGroup = false,
  textResolution = 2,
  showDefaultExpandButton = true,
): NodeView {
  const container = new Container();
  const textContainer = new Container();
  const controlContainer = new Container();
  container.eventMode = 'none';
  container.interactiveChildren = false;
  textContainer.eventMode = 'none';
  textContainer.interactiveChildren = false;
  controlContainer.eventMode = 'none';
  controlContainer.interactiveChildren = false;
  container.addChild(textContainer, controlContainer);

  const view: NodeView = {
    container,
    textContainer,
    controlContainer,
    overlapMask: null,
    controlMask: null,
    node,
    nodeId: node.id,
    collapsedGroup,
    title: null,
    summary: null,
    machineName: null,
    machineCount: null,
    expandButton: null,
    portLabels: [],
    statusBadges: [],
    portsBuilt: false,
  };
  updateNodeView(view, node, collapsedGroup, textResolution, showDefaultExpandButton);
  return view;
}

export function updateNodeView(
  view: NodeView,
  node: FlowNode,
  collapsedGroup = false,
  textResolution = 2,
  showDefaultExpandButton = true,
) {
  view.node = node;
  view.nodeId = node.id;
  view.collapsedGroup = collapsedGroup;
  clearNodeText(view);
  if (collapsedGroup && showDefaultExpandButton) createExpandButton(view, textResolution);
}

export function clearNodeText(view: NodeView) {
  view.textContainer.mask = null;
  view.controlContainer.mask = null;
  view.textContainer.removeChildren().forEach((child) => child.destroy());
  view.controlContainer.removeChildren().forEach((child) => child.destroy());
  view.overlapMask = null;
  view.controlMask = null;
  view.title = null;
  view.summary = null;
  view.machineName = null;
  view.machineCount = null;
  view.expandButton = null;
  view.portLabels.length = 0;
  view.statusBadges.length = 0;
  view.portsBuilt = false;
}

function createStatusBadge(
  view: NodeView,
  text: string,
  x: number,
  fill: number,
  border: number,
  textColor: number,
  textResolution: number,
) {
  const width = Math.ceil(measureNodeTextWidth(text, 11, 700)) + 16;
  const badge = new Container();
  const background = new Graphics()
    .roundRect(0, 0, width, 24, 6)
    .fill({ color: fill })
    .stroke({ color: border, width: 1 });
  const label = new Text({
    text,
    style: getSharedTextStyle({
      fill: textColor,
      fontFamily: NODE_FONT_FAMILY,
      fontSize: 11,
      fontWeight: '700',
    }),
    anchor: 0.5,
    resolution: textResolution,
  });
  label.position.set(width / 2, 12);
  badge.position.set(x, 10);
  badge.addChild(background, label);
  view.textContainer.addChild(badge);
  view.statusBadges.push(badge);
}

function createRecipeStatusBadges(view: NodeView, textResolution: number) {
  const colors = getCanvasThemeColors();
  if (view.node.data.isTarget) {
    const width = Math.ceil(measureNodeTextWidth('TARGET', 11, 700)) + 16;
    createStatusBadge(
      view,
      'TARGET',
      NODE_WIDTH - 40 - width,
      colors.nodeTargetBackground,
      colors.nodeTargetBorder,
      colors.textPrimary,
      textResolution,
    );
  }
  if (view.node.data.temperature) {
    createStatusBadge(
      view,
      view.node.data.temperature,
      10,
      colors.inputBackground,
      colors.inputBorder,
      colors.inputText,
      textResolution,
    );
  }
}

function createTitle(view: NodeView, textResolution: number) {
  const { width } = getRecipeNodeSize(view.node);
  const colors = getCanvasThemeColors();
  createRecipeStatusBadges(view, textResolution);
  const titleTextWidth =
    width - NODE_BORDER_WIDTH * 2 - NODE_INFO_SIDE_PADDING * 2 - NODE_TITLE_HORIZONTAL_PADDING * 2;
  const title = new Text({
    text: fitNodeTitle(view.node.label, titleTextWidth),
    style: getSharedTextStyle({
      fill: colors.textPrimary,
      fontFamily: NODE_FONT_FAMILY,
      fontSize: 15,
      fontWeight: '700',
    }),
    anchor: 0.5,
    resolution: textResolution,
  });
  title.position.set(width / 2, NODE_TITLE_TOP + NODE_TITLE_LINE_HEIGHT / 2);
  view.title = title;
  view.textContainer.addChild(title);
}

function createSummary(view: NodeView, textResolution: number) {
  const node = view.node;
  const colors = getCanvasThemeColors();
  const summaryRows = [
    ['Cycle: ', node.data.cycleTime ?? '—', 0],
    ['Power: ', node.data.power ?? '—', 2],
    ['Pollution: ', node.data.pollution ?? '—', 0],
  ] as const;
  const infoLeft = NODE_BORDER_WIDTH + NODE_INFO_SIDE_PADDING;
  const statsTop = NODE_TITLE_TOP + NODE_TITLE_LINE_HEIGHT + NODE_TITLE_MARGIN_BOTTOM;
  const statsWidth = NODE_WIDTH - infoLeft * 2;
  const naturalLeftWidth = Math.max(
    ...summaryRows.map(
      ([label, value, gap]) =>
        measureNodeTextWidth(label, NODE_HEADER_STAT_LABEL_SIZE, 600) +
        gap +
        measureNodeTextWidth(value, NODE_HEADER_STAT_LABEL_SIZE, 500),
    ),
  );
  const columns = getNodeHeaderColumnWidths(statsWidth, naturalLeftWidth);
  const rowCenters = getEvenlySpacedRowCenters(
    statsTop,
    NODE_HEADER_STATS_MIN_HEIGHT,
    NODE_HEADER_STAT_LINE_HEIGHT,
    NODE_HEADER_STAT_ROW_COUNT,
  );
  const summary: Text[] = [];

  summaryRows.forEach(([labelText, valueText, gap], index) => {
    const labelWidth = measureNodeTextWidth(labelText, NODE_HEADER_STAT_LABEL_SIZE, 600);
    const valueWidth = Math.max(0, columns.left - labelWidth - gap);
    const label = new Text({
      text: labelText,
      style: getSharedTextStyle({
        fill: colors.mutedText,
        fontFamily: NODE_FONT_FAMILY,
        fontSize: NODE_HEADER_STAT_LABEL_SIZE,
        fontWeight: '600',
      }),
      anchor: { x: 0, y: 0.5 },
      resolution: textResolution,
    });
    label.position.set(infoLeft, rowCenters[index]);
    const value = new Text({
      text: wrapTextWithEllipsis(valueText, valueWidth, 1, (text) =>
        measureNodeTextWidth(text, NODE_HEADER_STAT_LABEL_SIZE, 500),
      ),
      style: getSharedTextStyle({
        fill: colors.machineText,
        fontFamily: NODE_FONT_FAMILY,
        fontSize: NODE_HEADER_STAT_LABEL_SIZE,
        fontWeight: '500',
      }),
      anchor: { x: 0, y: 0.5 },
      resolution: textResolution,
    });
    value.position.set(infoLeft + labelWidth + gap, rowCenters[index]);
    summary.push(label, value);
    view.textContainer.addChild(label, value);
  });
  view.summary = summary;

  if (view.collapsedGroup) return;

  const machineNameText = wrapTextWithEllipsis(
    node.data.machineName ?? 'Machine',
    columns.right,
    2,
    (text) => measureNodeTextWidth(text, NODE_HEADER_MACHINE_NAME_SIZE, 600),
  );
  const machineNameLines = machineNameText.split('\n').length;
  const machineNameHeight = machineNameLines * NODE_HEADER_MACHINE_NAME_LINE_HEIGHT;
  const machineStackHeight = machineNameHeight + 4 + NODE_HEADER_MACHINE_COUNT_LINE_HEIGHT;
  const machineTop =
    statsTop + Math.max(0, (NODE_HEADER_STATS_MIN_HEIGHT - machineStackHeight) / 2);
  const machineX = infoLeft + columns.left + NODE_HEADER_STATS_GAP + columns.right;
  const machineName = new Text({
    text: machineNameText,
    style: getSharedTextStyle({
      fill: node.data.machineTierColor
        ? parseThemeColorCss(node.data.machineTierColor).color
        : colors.textPrimary,
      fontFamily: NODE_FONT_FAMILY,
      fontSize: NODE_HEADER_MACHINE_NAME_SIZE,
      fontWeight: '600',
      align: 'right',
      lineHeight: NODE_HEADER_MACHINE_NAME_LINE_HEIGHT,
    }),
    anchor: { x: 1, y: 0 },
    resolution: textResolution,
  });
  machineName.position.set(machineX, machineTop);
  view.machineName = machineName;
  view.textContainer.addChild(machineName);

  const machineCount = new Text({
    text: formatMachineCount(
      typeof node.data.machineCount === 'number'
        ? node.data.machineCount
        : Number(node.data.machineCount ?? 1),
    ),
    style: getSharedTextStyle({
      fill: colors.textPrimary,
      fontFamily: NODE_FONT_FAMILY,
      fontSize: NODE_HEADER_MACHINE_COUNT_SIZE,
      fontWeight: '700',
      lineHeight: NODE_HEADER_MACHINE_COUNT_LINE_HEIGHT,
      align: 'right',
    }),
    anchor: { x: 1, y: 0 },
    resolution: textResolution,
  });
  machineCount.position.set(machineX, machineTop + machineNameHeight + 4);
  view.machineCount = machineCount;
  view.textContainer.addChild(machineCount);
}

function createExpandButton(view: NodeView, textResolution: number) {
  const colors = getCanvasThemeColors();
  const button = new Container();
  const background = new Graphics();
  background
    .roundRect(0, 0, COLLAPSED_GROUP_EXPAND_BUTTON.width, COLLAPSED_GROUP_EXPAND_BUTTON.height, 6)
    .fill({ color: colors.buttonBackground })
    .stroke({ color: colors.buttonBorder, width: 1.5 });
  const label = new Text({
    text: 'EXPAND  ›',
    style: getSharedTextStyle({
      fill: colors.mutedText,
      fontFamily: NODE_FONT_FAMILY,
      fontSize: 11,
      fontWeight: '700',
    }),
    anchor: 0.5,
    resolution: textResolution,
  });
  label.position.set(
    COLLAPSED_GROUP_EXPAND_BUTTON.width / 2,
    COLLAPSED_GROUP_EXPAND_BUTTON.height / 2,
  );
  button.position.set(COLLAPSED_GROUP_EXPAND_BUTTON.x, COLLAPSED_GROUP_EXPAND_BUTTON.y);
  button.addChild(background, label);
  view.expandButton = button;
  view.controlContainer.addChild(button);
}

function createPortLabels(view: NodeView, textResolution: number) {
  const colors = getCanvasThemeColors();
  const linkedPorts = new Map<string, { direction: 'input' | 'output'; x: number; y: number }[]>();
  for (const direction of ['input', 'output'] as const) {
    const column = getPortColumnLayout(view.node, direction);
    for (const port of getOrderedPorts(view.node, direction)) {
      const position = getPortPosition(view.node, port.id);
      if (!position) continue;
      const linkId = port.linkId?.trim();
      if (linkId) {
        const anchors = linkedPorts.get(linkId) ?? [];
        anchors.push({
          direction,
          x: direction === 'input' ? column.x + column.width : column.x,
          y: position.y,
        });
        linkedPorts.set(linkId, anchors);
      }
      const rowWidth = column.width;
      const labelText =
        port.summary ??
        `1x ${port.label ?? `${direction === 'input' ? 'Input' : 'Output'} ${port.logicalIndex + 1}`}`;
      const label = new Text({
        text: wrapTextWithEllipsis(
          labelText,
          rowWidth - PORT_LABEL_HORIZONTAL_PADDING * 2,
          PORT_LABEL_MAX_LINES,
          (text) => measureNodeTextWidth(text, 13, 600),
        ),
        style: getSharedTextStyle({
          fill: direction === 'input' ? colors.inputText : colors.outputText,
          fontFamily: NODE_FONT_FAMILY,
          fontSize: 13,
          fontWeight: '600',
          align: 'center',
          lineHeight: PORT_LABEL_LINE_HEIGHT,
        }),
        anchor: { x: 0.5, y: 0.5 },
        resolution: textResolution,
      });
      label.position.set(column.x + rowWidth / 2, position.y);
      view.portLabels.push(label);
      view.textContainer.addChild(label);
    }
  }
  const productLinks = new Graphics();
  const linkColor = getThemeColor(THEME_COLOR.info);
  for (const anchors of linkedPorts.values()) {
    const inputs = anchors.filter((anchor) => anchor.direction === 'input');
    const outputs = anchors.filter((anchor) => anchor.direction === 'output');
    const pairs =
      inputs.length > 0 && outputs.length > 0
        ? inputs.flatMap((input) => outputs.map((output) => [input, output] as const))
        : anchors.slice(1).map((anchor, index) => [anchors[index], anchor] as const);
    for (const [start, end] of pairs) {
      if (!start || !end) continue;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      for (let offset = 0; offset < length; offset += 9) {
        const stop = Math.min(length, offset + 5);
        productLinks
          .moveTo(start.x + (dx * offset) / length, start.y + (dy * offset) / length)
          .lineTo(start.x + (dx * stop) / length, start.y + (dy * stop) / length)
          .stroke({ color: linkColor, width: 2 });
      }
      productLinks
        .circle(start.x, start.y, 3)
        .fill({ color: linkColor })
        .stroke({ color: colors.nodeBackground, width: 1 });
      productLinks
        .circle(end.x, end.y, 3)
        .fill({ color: linkColor })
        .stroke({ color: colors.nodeBackground, width: 1 });
    }
  }
  if (linkedPorts.size > 0) view.textContainer.addChildAt(productLinks, 0);
  else productLinks.destroy();
  view.portsBuilt = true;
}

export function setNodeDetailLevel(
  view: NodeView,
  zoom: number,
  highlighted = false,
  inCamera = true,
  textResolution = 1,
  forceDetails = false,
) {
  const visibility = getNodeTextVisibility(zoom, highlighted, forceDetails);
  if (inCamera) {
    if (visibility.title && !view.title) createTitle(view, textResolution);
    if (visibility.summary && !view.summary) createSummary(view, textResolution);
    if (visibility.ports && !view.portsBuilt) createPortLabels(view, textResolution);
  }
  if (view.title) view.title.visible = visibility.title;
  if (view.summary) for (const line of view.summary) line.visible = visibility.summary;
  if (view.machineName) view.machineName.visible = visibility.summary;
  if (view.machineCount) view.machineCount.visible = visibility.summary;
  if (view.expandButton) view.expandButton.visible = true;
  for (const label of view.portLabels) label.visible = visibility.ports;
  for (const badge of view.statusBadges) badge.visible = visibility.title;
  view.container.renderable =
    inCamera && (visibility.title || visibility.summary || visibility.ports || !!view.expandButton);
}
