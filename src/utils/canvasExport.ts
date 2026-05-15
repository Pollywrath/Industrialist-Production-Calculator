import { toPng } from 'html-to-image';
import { getNodesBounds, type Node } from '@xyflow/react';
import type { SaveRecord } from '../types/saves';
import { useUIStore } from '../stores/useUIStore';

/**
 * Conservative maximum canvas dimension in pixels.
 * Chrome/Firefox support up to 32,767px per axis but Safari/iOS are
 * limited to ~16,384px. Using 16,384 keeps exports safe across all
 * mainstream browsers without requiring runtime feature detection.
 */
const MAX_CANVAS_DIMENSION = 16384;

export function exportRecordAsJson(record: SaveRecord): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
  const link = document.createElement('a');
  link.download = `${record.name.replace(/\s+/g, '_')}_save.json`;
  link.href = dataStr;
  link.click();
}

export async function exportCanvasAsPng(nodes: Node[]): Promise<void> {
  const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewportElement || nodes.length === 0) {
    throw new Error('No elements or nodes found for PNG export');
  }

  const themeBg =
    getComputedStyle(document.documentElement).getPropertyValue('--theme-color-canvas-bg').trim() ||
    '#0a0a0a';

  const bounds = getNodesBounds(nodes);
  const padding = 50;

  const naturalWidth = bounds.width + padding * 2;
  const naturalHeight = bounds.height + padding * 2;

  // Clamp to browser canvas limits — scale down proportionally if either
  // dimension exceeds the safe maximum so the export never produces a
  // blank or corrupted image.
  const scale = Math.min(1, MAX_CANVAS_DIMENSION / naturalWidth, MAX_CANVAS_DIMENSION / naturalHeight);
  const exportWidth = Math.round(naturalWidth * scale);
  const exportHeight = Math.round(naturalHeight * scale);

  const uiStore = useUIStore.getState();
  uiStore.setIsExporting(true);

  try {
    // Yield to let the browser paint the "Rendering PNG..." status message
    // and let the nodes re-render without LOD/blur.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 50)); // Extra safety buffer for layout

    const dataUrl = await toPng(viewportElement, {
      backgroundColor: themeBg,
      width: exportWidth,
      height: exportHeight,
      pixelRatio: 1,
      style: {
        width: `${naturalWidth}px`,
        height: `${naturalHeight}px`,
        transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(${scale})`,
        transformOrigin: 'top left',
      },
    });

    const link = document.createElement('a');
    link.download = `industrialist-canvas-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    uiStore.setIsExporting(false);
  }
}

