import type { Viewport } from '../domain/graph/types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 3;

type Listener = (viewport: Viewport) => void;

export class ViewportStore {
  private viewport: Viewport;
  private listeners = new Set<Listener>();

  constructor(initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }) {
    this.viewport = normalizeViewport(initialViewport);
  }

  getState = () => this.viewport;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setViewport(viewport: Viewport) {
    const next = normalizeViewport(viewport);
    if (
      this.viewport.x === next.x &&
      this.viewport.y === next.y &&
      this.viewport.zoom === next.zoom
    ) {
      return;
    }

    this.viewport = next;
    this.listeners.forEach((listener) => listener(next));
  }
}

function normalizeViewport(viewport: Viewport): Viewport {
  if (
    !Number.isFinite(viewport.x) ||
    !Number.isFinite(viewport.y) ||
    !Number.isFinite(viewport.zoom)
  ) {
    throw new Error('Viewport coordinates and zoom must be finite.');
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom)),
  };
}

export const viewportStore = new ViewportStore();
