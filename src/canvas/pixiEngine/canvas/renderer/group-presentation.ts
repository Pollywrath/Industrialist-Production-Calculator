import { Container, Graphics, Sprite, Text, Texture, type TextStyleFontWeight } from 'pixi.js';
import type { FlowGroup } from '../../domain/graph/types';
import type { CanvasThemeColors } from '../../theme/theme-colors';
import { getThemeColorCss, parseThemeColorCss, THEME_COLOR } from '../../theme/theme-colors';
import type {
  NodeVisualDescription,
  NodeVisualShape,
  VisualPaint,
} from '../../domain/graph/type-registry';
import type { CanvasOrderModel } from './canvas-order';
import { GROUP_HEADER_HEIGHT, type GroupBounds } from '../../domain/nodes/group/geometry';
import type { Bounds } from './spatial-index';
import { RENDER_BAND } from './render-order';

interface GroupView {
  readonly container: Container;
  readonly background: Graphics;
  readonly chromeContainer: Container;
  readonly chrome: Graphics;
  readonly selectionContainer: Container;
  readonly title: Text;
  readonly selectionBackground: Graphics;
  readonly selectionOutline: Graphics;
  readonly selectionTitle: Text;
  appliedVisual: NodeVisualDescription | undefined;
  readonly customChildren: (Text | Sprite)[];
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface GroupPresentationOptions {
  readonly fillLayer: Container;
  readonly chromeLayer: Container;
  readonly selectedLayer: Container;
  readonly themeColors: CanvasThemeColors;
  readonly textResolution: number;
  readonly order: CanvasOrderModel;
  readonly getGroup: (id: string) => FlowGroup | undefined;
  readonly getBounds: (id: string) => GroupBounds | undefined;
  readonly getVisual: (id: string) => NodeVisualDescription | undefined;
  readonly queryGroups: (bounds: Bounds) => readonly string[];
  readonly resolveAsset?: (assetId: string) => CanvasImageSource | null;
}

export class GroupPresentationController {
  private readonly views = new Map<string, GroupView>();
  private orderDirty = true;
  private readonly options: GroupPresentationOptions;

  constructor(options: GroupPresentationOptions) {
    this.options = options;
  }

  markOrderDirty() {
    this.orderDirty = true;
  }

  sync(
    cameraBounds: Bounds,
    selectedGroupId: string | null,
    projectedGroupIds?: readonly string[],
  ) {
    const groupIds = projectedGroupIds ?? this.options.queryGroups(cameraBounds);
    const visible = new Set(
      groupIds.filter((id) => {
        const group = this.options.getGroup(id);
        return !!group && !group.collapsed && !!this.options.getBounds(id);
      }),
    );
    for (const [id, view] of this.views) {
      if (visible.has(id)) continue;
      this.options.fillLayer.removeChild(view.container);
      this.options.chromeLayer.removeChild(view.chromeContainer);
      this.options.selectedLayer.removeChild(view.selectionContainer);
      this.destroyCustomChildren(view);
      view.container.destroy({ children: true });
      view.chromeContainer.destroy({ children: true });
      view.selectionContainer.destroy({ children: true });
      this.views.delete(id);
      this.orderDirty = true;
    }

    for (const id of visible) {
      const group = this.options.getGroup(id);
      const bounds = this.options.getBounds(id);
      if (!group || !bounds) continue;
      let view = this.views.get(id);
      if (!view) {
        view = this.createView(group.label);
        this.views.set(id, view);
        this.orderDirty = true;
        this.options.fillLayer.addChild(view.container);
        this.options.chromeLayer.addChild(view.chromeContainer);
        this.options.selectedLayer.addChild(view.selectionContainer);
      }
      this.updateView(view, group, bounds, selectedGroupId === id);
    }
    this.syncOrder();
  }

  headerAtPoint(point: Point) {
    const id = this.findGroupAtPoint(point, (bounds) => point.y <= bounds.y + GROUP_HEADER_HEIGHT);
    return id ? this.getGroupHit(id) : null;
  }

  atPoint(point: Point) {
    const id = this.findGroupAtPoint(point, () => true);
    return id ? this.getGroupHit(id) : null;
  }

  selectedHeaderOverlayAtPoint(point: Point, selectedGroupId: string | null) {
    if (!selectedGroupId) return null;
    const group = this.options.getGroup(selectedGroupId);
    const bounds = group && !group.collapsed ? this.options.getBounds(selectedGroupId) : undefined;
    const view = this.views.get(selectedGroupId);
    if (!group || !bounds || !view) return null;
    if (isExpandedGroupMenuAtPoint(bounds, point)) return { group, bounds };
    const title = view.selectionTitle;
    const titleLeft = bounds.x + title.x;
    const titleTop = bounds.y + title.y - title.height / 2;
    if (
      point.x >= titleLeft &&
      point.x <= titleLeft + title.width &&
      point.y >= titleTop &&
      point.y <= titleTop + title.height
    )
      return { group, bounds };
    return null;
  }

  destroy() {
    for (const [id, view] of this.views) {
      this.options.fillLayer.removeChild(view.container);
      this.options.chromeLayer.removeChild(view.chromeContainer);
      this.options.selectedLayer.removeChild(view.selectionContainer);
      this.destroyCustomChildren(view);
      view.container.destroy({ children: true });
      view.chromeContainer.destroy({ children: true });
      view.selectionContainer.destroy({ children: true });
      this.views.delete(id);
    }
  }

  private findGroupAtPoint(point: Point, hit: (bounds: GroupBounds) => boolean) {
    const ids = this.options.queryGroups({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    });
    return findTopmostGroupHit(ids, this.options.order, (id) => {
      const group = this.options.getGroup(id);
      const bounds = this.options.getBounds(id);
      return (
        !!group &&
        !group.collapsed &&
        !!bounds &&
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height &&
        hit(bounds)
      );
    });
  }

  private getGroupHit(id: string) {
    const group = this.options.getGroup(id);
    const bounds = this.options.getBounds(id);
    return group && bounds ? { group, bounds } : null;
  }

  private syncOrder() {
    if (!this.orderDirty) return;
    const ids = this.options.order.bottommostFirst(
      [...this.views.keys()],
      'group',
      RENDER_BAND.groupChrome,
    );
    ids.forEach((id, index) => {
      const view = this.views.get(id);
      if (!view) return;
      this.options.fillLayer.setChildIndex(view.container, index);
      this.options.chromeLayer.setChildIndex(view.chromeContainer, index);
      this.options.selectedLayer.setChildIndex(view.selectionContainer, index);
    });
    this.orderDirty = false;
  }

  private createView(label: string): GroupView {
    const container = new Container();
    const background = new Graphics();
    const chromeContainer = new Container();
    const chrome = new Graphics();
    const selectionBackground = new Graphics();
    const selectionOutline = new Graphics();
    const selectionContainer = new Container();
    const textStyle = {
      fill: this.options.themeColors.textPrimary,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 14,
      fontWeight: '600' as const,
    };
    const selectionTitle = new Text({
      text: label,
      style: textStyle,
      anchor: { x: 0, y: 0.5 },
      resolution: this.options.textResolution,
    });
    const title = new Text({
      text: label,
      style: textStyle,
      anchor: { x: 0, y: 0.5 },
      resolution: this.options.textResolution,
    });
    container.eventMode = 'none';
    chromeContainer.eventMode = 'none';
    selectionContainer.eventMode = 'none';
    container.addChild(background);
    chromeContainer.addChild(chrome, title);
    selectionContainer.addChild(selectionBackground, selectionOutline, selectionTitle);
    return {
      container,
      background,
      chromeContainer,
      chrome,
      selectionContainer,
      title,
      selectionBackground,
      selectionOutline,
      selectionTitle,
      appliedVisual: undefined,
      customChildren: [],
    };
  }

  private updateView(view: GroupView, group: FlowGroup, bounds: GroupBounds, selected: boolean) {
    const { themeColors } = this.options;
    view.container.position.set(bounds.x, bounds.y);
    view.chromeContainer.position.set(bounds.x, bounds.y);
    view.selectionContainer.position.set(bounds.x, bounds.y);
    const visual = this.options.getVisual(group.id);
    if (view.appliedVisual !== visual) {
      this.applyVisual(view, visual);
      view.appliedVisual = visual;
    }
    view.background.clear();
    if (visual) {
      for (const shape of visual.shapes)
        if (shape.fill !== undefined) drawVisualShape(view.background, shape, shape.fill, false);
    } else {
      view.background
        .roundRect(0, 0, bounds.width, bounds.height, 8)
        .fill({ color: themeColors.nodeBackground, alpha: 0.22 });
    }
    view.chrome.clear();
    if (visual) {
      for (const shape of visual.shapes)
        if (shape.stroke !== undefined) drawVisualShape(view.chrome, shape, shape.stroke, true);
      for (const control of visual.controls) {
        const shape = controlToShape(control);
        drawVisualShape(view.chrome, shape, control.fill ?? 'buttonBackground', false);
        drawVisualShape(view.chrome, shape, control.stroke ?? 'buttonBorder', true);
      }
    } else {
      view.chrome
        .roundRect(0, 0, bounds.width, bounds.height, 8)
        .stroke({ color: themeColors.nodeBorder, width: 2 });
      view.chrome
        .moveTo(0, GROUP_HEADER_HEIGHT)
        .lineTo(bounds.width, GROUP_HEADER_HEIGHT)
        .stroke({ color: themeColors.divider, width: 1, alpha: themeColors.dividerAlpha });
      drawMenuControl(view.chrome, bounds.width - 34, 9, themeColors);
    }
    view.title.text = group.label;
    view.title.position.set(12, GROUP_HEADER_HEIGHT / 2);
    view.title.visible = !visual;
    view.selectionBackground.clear();
    view.selectionBackground.visible = false;
    view.selectionOutline.clear();
    view.selectionOutline.visible = selected;
    view.selectionTitle.text = group.label;
    view.selectionTitle.position.set(12, GROUP_HEADER_HEIGHT / 2);
    view.selectionTitle.visible = selected && !visual;
    if (selected) {
      view.selectionOutline
        .roundRect(0, 0, bounds.width, bounds.height, 8)
        .stroke({ color: themeColors.selected, width: 3 });
      view.selectionOutline
        .moveTo(0, GROUP_HEADER_HEIGHT)
        .lineTo(bounds.width, GROUP_HEADER_HEIGHT)
        .stroke({ color: themeColors.selected, width: 1.5, alpha: 0.9 });
      if (visual) {
        for (const control of visual.controls) {
          const shape = controlToShape(control);
          drawVisualShape(view.selectionOutline, shape, control.fill ?? 'buttonBackground', false);
          drawVisualShape(view.selectionOutline, shape, control.stroke ?? 'buttonBorder', true);
        }
      } else drawMenuControl(view.selectionOutline, bounds.width - 34, 9, themeColors);
    }
  }

  private applyVisual(view: GroupView, visual: NodeVisualDescription | undefined) {
    this.destroyCustomChildren(view);
    if (!visual) return;
    for (const item of visual.texts) {
      const color = resolvePaint(item.color);
      const text = new Text({
        text: item.text,
        style: {
          fill: color.color,
          fontFamily: item.fontFamily ?? 'system-ui, sans-serif',
          fontSize: item.fontSize,
          fontWeight: String(item.fontWeight ?? '400') as TextStyleFontWeight,
          wordWrap: item.width !== undefined,
          wordWrapWidth: item.width,
        },
        anchor: {
          x: item.align === 'center' ? 0.5 : item.align === 'right' ? 1 : 0,
          y: item.verticalAlign === 'middle' ? 0.5 : item.verticalAlign === 'bottom' ? 1 : 0,
        },
        resolution: this.options.textResolution,
      });
      text.position.set(item.x, item.y);
      view.chromeContainer.addChild(text);
      view.customChildren.push(text);
    }
    for (const asset of visual.assets) {
      const source = this.options.resolveAsset?.(asset.asset);
      if (!source) continue;
      const sprite = new Sprite(Texture.from(source));
      const width = asset.bounds.width;
      const height = asset.bounds.height;
      const fit = asset.fit ?? 'contain';
      if (fit === 'stretch') {
        sprite.position.set(asset.bounds.x, asset.bounds.y);
        sprite.width = width;
        sprite.height = height;
      } else {
        const scaleX = width / Math.max(1, sprite.texture.width);
        const scaleY = height / Math.max(1, sprite.texture.height);
        sprite.scale.set(fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY));
        sprite.position.set(
          asset.bounds.x + (width - sprite.width) / 2,
          asset.bounds.y + (height - sprite.height) / 2,
        );
      }
      view.chromeContainer.addChild(sprite);
      view.customChildren.push(sprite);
    }
  }

  private destroyCustomChildren(view: GroupView) {
    for (const child of view.customChildren) {
      view.chromeContainer.removeChild(child);
      if (child instanceof Sprite) child.destroy({ texture: false, textureSource: false });
      else child.destroy();
    }
    view.customChildren.length = 0;
  }
}

function resolvePaint(paint: VisualPaint) {
  if (typeof paint === 'number') return { color: paint & 0xffffff, alpha: 1 };
  const token =
    (THEME_COLOR as Record<string, string>)[paint] ??
    (Object.values(THEME_COLOR).includes(paint as (typeof THEME_COLOR)[keyof typeof THEME_COLOR])
      ? paint
      : undefined);
  const css = token
    ? getThemeColorCss(token as (typeof THEME_COLOR)[keyof typeof THEME_COLOR])
    : paint;
  try {
    return parseThemeColorCss(css);
  } catch {
    return { color: 0xffffff, alpha: 1 };
  }
}

function controlToShape(control: NodeVisualDescription['controls'][number]): NodeVisualShape {
  const bounds = control.bounds;
  if (control.shape === 'circle') {
    return {
      kind: 'circle',
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2,
      radius: Math.min(bounds.width, bounds.height) / 2,
    };
  }
  return { kind: control.shape ?? 'round-rect', bounds, radius: 5 };
}

function drawVisualShape(
  graphics: Graphics,
  shape: NodeVisualShape,
  paint: VisualPaint,
  stroke: boolean,
) {
  const resolved = resolvePaint(paint);
  if (shape.kind === 'rect') {
    const { x, y, width, height } = shape.bounds;
    if (stroke)
      graphics
        .rect(x, y, width, height)
        .stroke({ color: resolved.color, alpha: resolved.alpha, width: shape.strokeWidth ?? 1 });
    else graphics.rect(x, y, width, height).fill({ color: resolved.color, alpha: resolved.alpha });
  } else if (shape.kind === 'round-rect') {
    const { x, y, width, height } = shape.bounds;
    if (stroke)
      graphics
        .roundRect(x, y, width, height, shape.radius ?? 6)
        .stroke({ color: resolved.color, alpha: resolved.alpha, width: shape.strokeWidth ?? 1 });
    else
      graphics
        .roundRect(x, y, width, height, shape.radius ?? 6)
        .fill({ color: resolved.color, alpha: resolved.alpha });
  } else if (shape.kind === 'circle') {
    if (stroke)
      graphics
        .circle(shape.centerX, shape.centerY, shape.radius)
        .stroke({ color: resolved.color, alpha: resolved.alpha, width: shape.strokeWidth ?? 1 });
    else
      graphics
        .circle(shape.centerX, shape.centerY, shape.radius)
        .fill({ color: resolved.color, alpha: resolved.alpha });
  } else if ('points' in shape && shape.points.length > 2) {
    const path = shape.points.flatMap((point) => [point.x, point.y]);
    if (stroke)
      graphics
        .poly(path, true)
        .stroke({ color: resolved.color, alpha: resolved.alpha, width: shape.strokeWidth ?? 1 });
    else graphics.poly(path, true).fill({ color: resolved.color, alpha: resolved.alpha });
  }
}

export function isExpandedGroupMenuAtPoint(bounds: GroupBounds, point: Point) {
  const controlX = bounds.x + bounds.width - 34;
  const controlY = bounds.y + 9;
  return (
    point.x >= controlX &&
    point.x <= controlX + 24 &&
    point.y >= controlY &&
    point.y <= controlY + 24
  );
}

export function findTopmostGroupHit(
  ids: readonly string[],
  order: CanvasOrderModel,
  hit: (id: string) => boolean,
) {
  return order.topmostFirst(ids, 'group', RENDER_BAND.groupChrome).find(hit) ?? null;
}

function drawMenuControl(graphics: Graphics, x: number, y: number, colors: CanvasThemeColors) {
  graphics
    .roundRect(x, y, 24, 24, 6)
    .fill({ color: colors.buttonBackground })
    .stroke({ color: colors.buttonBorder, width: 1.5 });
  for (const dotX of [x + 8, x + 12, x + 16]) {
    graphics.circle(dotX, y + 12, 1.15).fill(colors.buttonDots);
  }
}
