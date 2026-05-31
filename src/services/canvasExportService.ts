import { toBlob } from 'html-to-image';
import { getNodesBounds, type Node } from '@xyflow/react';
import type { SaveRecord } from '../types/saves';
import { useUIStore } from '../stores/useUIStore';

const MAX_CANVAS_DIMENSION = 16384;

export function exportRecordAsJson(record: SaveRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${record.name.replace(/\s+/g, '_')}_save.json`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportCanvasAsPng(nodes: Node[]): Promise<void> {
  const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewportElement || nodes.length === 0) {
    throw new Error('No elements or nodes found for PNG export');
  }

  const themeBg = getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-color-canvas-bg')
    .trim();

  if (!themeBg) {
    throw new Error(
      'Required theme variable --theme-color-canvas-bg is not defined on document.documentElement',
    );
  }

  const nodeLookup = new Map(nodes.map((node) => [node.id, node])) as unknown as Parameters<
    typeof getNodesBounds
  >[1] extends { nodeLookup?: infer L }
    ? L
    : never;
  const bounds = getNodesBounds(nodes, { nodeLookup });
  const padding = 50;

  const naturalWidth = bounds.width + padding * 2;
  const naturalHeight = bounds.height + padding * 2;

  const scale = Math.min(
    1,
    MAX_CANVAS_DIMENSION / naturalWidth,
    MAX_CANVAS_DIMENSION / naturalHeight,
  );
  const exportWidth = Math.round(naturalWidth * scale);
  const exportHeight = Math.round(naturalHeight * scale);

  const uiStore = useUIStore.getState();
  uiStore.setIsExporting(true);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const blob = await toBlob(viewportElement, {
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
    if (!blob) {
      throw new Error('PNG export failed: toBlob returned null');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `industrialist-canvas-${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    uiStore.setIsExporting(false);
  }
}
