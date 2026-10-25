import type { Viewport } from '../../domain/graph/types';
import type { ViewportStore } from '../../state/viewport-store';

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface AutoPanDelta {
  readonly x: number;
  readonly y: number;
}

export function getAutoPanDelta(
  pointer: { readonly x: number; readonly y: number },
  size: ScreenSize,
  edgeSize = 48,
  maxSpeed = 720,
): AutoPanDelta {
  const axis = (value: number, length: number) => {
    if (value < edgeSize)
      return -maxSpeed * Math.max(0, Math.min(1, (edgeSize - value) / edgeSize));
    if (value > length - edgeSize)
      return maxSpeed * Math.max(0, Math.min(1, (value - (length - edgeSize)) / edgeSize));
    return 0;
  };
  return { x: axis(pointer.x, size.width), y: axis(pointer.y, size.height) };
}

export interface AutoPanScheduler {
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
}

const browserScheduler: AutoPanScheduler = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export class AutoPanController {
  private active = false;
  private pointer: { x: number; y: number } | null = null;
  private frameId: number | null = null;
  private lastFrameTime: number | null = null;
  private readonly camera: ViewportStore;
  private readonly getSize: () => ScreenSize;
  private readonly scheduler: AutoPanScheduler;

  constructor(
    camera: ViewportStore,
    getSize: () => ScreenSize,
    scheduler: AutoPanScheduler = browserScheduler,
  ) {
    this.camera = camera;
    this.getSize = getSize;
    this.scheduler = scheduler;
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) this.stop();
    else this.schedule();
  }

  setPointer(pointer: { readonly x: number; readonly y: number } | null) {
    this.pointer = pointer ? { x: pointer.x, y: pointer.y } : null;
    if (!this.pointer) this.stop();
    else this.schedule();
  }

  destroy() {
    this.active = false;
    this.pointer = null;
    this.stop();
  }

  private schedule() {
    if (!this.active || !this.pointer || this.frameId !== null) return;
    this.frameId = this.scheduler.requestFrame((time) => this.tick(time));
  }

  private stop() {
    if (this.frameId !== null) this.scheduler.cancelFrame(this.frameId);
    this.frameId = null;
    this.lastFrameTime = null;
  }

  private tick(time: number) {
    this.frameId = null;
    const pointer = this.pointer;
    if (!this.active || !pointer) return;
    const delta = getAutoPanDelta(pointer, this.getSize());
    if (delta.x === 0 && delta.y === 0) {
      this.lastFrameTime = null;
      return;
    }
    const elapsed =
      this.lastFrameTime === null ? 0 : Math.min(50, Math.max(0, time - this.lastFrameTime));
    this.lastFrameTime = time;
    const viewport: Viewport = this.camera.getState();
    this.camera.setViewport({
      ...viewport,
      x: viewport.x - (delta.x * elapsed) / 1000,
      y: viewport.y - (delta.y * elapsed) / 1000,
    });
    this.schedule();
  }
}
