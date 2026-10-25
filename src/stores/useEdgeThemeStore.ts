import { create } from 'zustand';

export type EdgeLineStyle = 'solid' | 'dashed' | 'dotted';
export type EdgePathStyle = 'straight' | 'bezier' | 'orthogonal';
export type EdgeAnimationStyle = 'none' | 'moving-dashes' | 'pulse-arrow';

export interface EdgeStyleSettings {
  lineStyle: EdgeLineStyle;
  pathStyle: EdgePathStyle;
  animationStyle: EdgeAnimationStyle;
}

interface EdgeThemeState extends EdgeStyleSettings {
  setLineStyle: (lineStyle: EdgeLineStyle) => void;
  setPathStyle: (pathStyle: EdgePathStyle) => void;
  setAnimationStyle: (animationStyle: EdgeAnimationStyle) => void;
  resetEdgeStyles: () => void;
}

const EDGE_THEME_STORAGE_KEY = 'industrialist_edge_theme_v1';

export const DEFAULT_EDGE_LINE_STYLE: EdgeLineStyle = 'solid';
export const DEFAULT_EDGE_PATH_STYLE: EdgePathStyle = 'orthogonal';
export const DEFAULT_EDGE_ANIMATION_STYLE: EdgeAnimationStyle = 'pulse-arrow';

const DEFAULT_EDGE_STYLE_SETTINGS: EdgeStyleSettings = {
  lineStyle: DEFAULT_EDGE_LINE_STYLE,
  pathStyle: DEFAULT_EDGE_PATH_STYLE,
  animationStyle: DEFAULT_EDGE_ANIMATION_STYLE,
};

function isEdgeLineStyle(value: unknown): value is EdgeLineStyle {
  return value === 'solid' || value === 'dashed' || value === 'dotted';
}

function isEdgePathStyle(value: unknown): value is EdgePathStyle {
  return value === 'straight' || value === 'bezier' || value === 'orthogonal';
}

function isEdgeAnimationStyle(value: unknown): value is EdgeAnimationStyle {
  return value === 'none' || value === 'moving-dashes' || value === 'pulse-arrow';
}

function sanitizeEdgeStyleSettings(raw: unknown): EdgeStyleSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EDGE_STYLE_SETTINGS };
  }

  const maybe = raw as Partial<Record<keyof EdgeStyleSettings, unknown>>;
  const lineStyle = isEdgeLineStyle(maybe.lineStyle)
    ? maybe.lineStyle
    : DEFAULT_EDGE_STYLE_SETTINGS.lineStyle;
  return {
    lineStyle,
    pathStyle: isEdgePathStyle(maybe.pathStyle)
      ? maybe.pathStyle
      : DEFAULT_EDGE_STYLE_SETTINGS.pathStyle,
    animationStyle: isEdgeAnimationStyle(maybe.animationStyle)
      ? maybe.animationStyle
      : lineStyle === 'solid'
        ? 'none'
        : 'moving-dashes',
  };
}

function loadStoredEdgeStyleSettings(): EdgeStyleSettings {
  try {
    const raw = localStorage.getItem(EDGE_THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDGE_STYLE_SETTINGS };
    return sanitizeEdgeStyleSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EDGE_STYLE_SETTINGS };
  }
}

function persistEdgeStyleSettings(settings: EdgeStyleSettings): void {
  try {
    localStorage.setItem(EDGE_THEME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    void 0;
  }
}

function buildSettings(
  lineStyle: EdgeLineStyle,
  pathStyle: EdgePathStyle,
  animationStyle: EdgeAnimationStyle,
): EdgeStyleSettings {
  return { lineStyle, pathStyle, animationStyle };
}

const initialSettings = loadStoredEdgeStyleSettings();

const useEdgeThemeStore = create<EdgeThemeState>((set, get) => ({
  ...initialSettings,

  setLineStyle: (lineStyle) => {
    const current = get();
    if (current.lineStyle === lineStyle) return;

    const next = buildSettings(lineStyle, current.pathStyle, current.animationStyle);
    persistEdgeStyleSettings(next);
    set({ lineStyle });
  },

  setPathStyle: (pathStyle) => {
    const current = get();
    if (current.pathStyle === pathStyle) return;

    const next = buildSettings(current.lineStyle, pathStyle, current.animationStyle);
    persistEdgeStyleSettings(next);
    set({ pathStyle });
  },

  setAnimationStyle: (animationStyle) => {
    const current = get();
    if (current.animationStyle === animationStyle) return;

    const next = buildSettings(current.lineStyle, current.pathStyle, animationStyle);
    persistEdgeStyleSettings(next);
    set({ animationStyle });
  },

  resetEdgeStyles: () => {
    const next = { ...DEFAULT_EDGE_STYLE_SETTINGS };
    persistEdgeStyleSettings(next);
    set(next);
  },
}));

export function hasCustomEdgeStyleSettings(settings: EdgeStyleSettings): boolean {
  return (
    settings.lineStyle !== DEFAULT_EDGE_STYLE_SETTINGS.lineStyle ||
    settings.pathStyle !== DEFAULT_EDGE_STYLE_SETTINGS.pathStyle ||
    settings.animationStyle !== DEFAULT_EDGE_STYLE_SETTINGS.animationStyle
  );
}

export { useEdgeThemeStore };
