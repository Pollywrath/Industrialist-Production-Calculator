import { create } from 'zustand';
import { getCanvasAdapter, setPendingCanvasViewState } from '../canvas/canvasAdapterApi';

export type CanvasRendererPreference = 'pixi-webgl' | 'react-flow';
export type ActiveCanvasRenderer = CanvasRendererPreference | null;
export type RendererAvailability = 'unknown' | 'available' | 'unavailable';

interface CanvasRendererState {
  preference: CanvasRendererPreference;
  preferenceRevision: number;
  activeRenderer: ActiveCanvasRenderer;
  webglAvailability: RendererAvailability;
  fallbackNoticeVisible: boolean;
  setPreference(preference: CanvasRendererPreference): void;
  setActiveRenderer(renderer: ActiveCanvasRenderer): void;
  setWebGLAvailability(availability: RendererAvailability): void;
  showFallbackNotice(): void;
  dismissFallbackNotice(): void;
}

export const CANVAS_RENDERER_STORAGE_KEY = 'industrialist_canvas_renderer_v1';
export const DEFAULT_CANVAS_RENDERER: CanvasRendererPreference = 'pixi-webgl';

function isCanvasRendererPreference(value: unknown): value is CanvasRendererPreference {
  return value === 'pixi-webgl' || value === 'react-flow';
}

export function resolveCanvasRendererPreference(value: unknown): CanvasRendererPreference {
  if (value === 'pixi-webgpu') return 'pixi-webgl';

  return isCanvasRendererPreference(value) ? value : DEFAULT_CANVAS_RENDERER;
}

function writePreference(preference: CanvasRendererPreference): void {
  try {
    localStorage.setItem(CANVAS_RENDERER_STORAGE_KEY, preference);
  } catch {
    // Renderer choice is a best-effort local preference.
  }
}

function readPreference(): CanvasRendererPreference {
  try {
    const stored = localStorage.getItem(CANVAS_RENDERER_STORAGE_KEY);
    const preference = resolveCanvasRendererPreference(stored);

    if (stored === 'pixi-webgpu') {
      writePreference(preference);
    }

    return preference;
  } catch {
    return DEFAULT_CANVAS_RENDERER;
  }
}

export const useCanvasRendererStore = create<CanvasRendererState>((set, get) => ({
  preference: readPreference(),
  preferenceRevision: 0,
  activeRenderer: null,
  webglAvailability: 'unknown',
  fallbackNoticeVisible: false,

  setPreference: (preference) => {
    if (get().preference === preference) return;

    const viewState = getCanvasAdapter()?.getViewState?.();
    if (viewState) setPendingCanvasViewState(viewState);

    writePreference(preference);

    set({
      preference,
      preferenceRevision: get().preferenceRevision + 1,
      fallbackNoticeVisible: false,
    });
  },

  setActiveRenderer: (activeRenderer) => set({ activeRenderer }),

  setWebGLAvailability: (availability) => set({ webglAvailability: availability }),

  showFallbackNotice: () => set({ fallbackNoticeVisible: true }),

  dismissFallbackNotice: () => set({ fallbackNoticeVisible: false }),
}));

export function isRendererChoiceAvailable(
  preference: CanvasRendererPreference,
  availability: RendererAvailability,
): boolean {
  return preference === 'react-flow' || availability === 'available';
}

export function getActiveRendererLabel(renderer: ActiveCanvasRenderer): string {
  if (renderer === 'pixi-webgl') return 'PixiJS · WebGL';
  if (renderer === 'react-flow') return 'React Flow';
  return 'Starting';
}
