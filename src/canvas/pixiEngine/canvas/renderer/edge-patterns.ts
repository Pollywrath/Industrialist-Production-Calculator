import { BufferImageSource, Texture } from 'pixi.js';

export const EDGE_PATTERN_PERIOD = 24;
export const MOVING_DASH_PERIOD = EDGE_PATTERN_PERIOD;
export const EDGE_FLOW_SPEED = 32;
export const DIRECTION_ARROW_PERIOD = 120;

type EdgePattern = 'dashed' | 'dotted' | 'moving-dashes' | 'pulse-arrow';

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getPixelAlpha(pattern: EdgePattern, along: number, side: number) {
  if (pattern === 'dashed' || pattern === 'moving-dashes') {
    const dashLength = 14;
    const phase = along % EDGE_PATTERN_PERIOD;
    return clamp01((dashLength - phase + 0.08) / 0.16);
  }
  if (pattern === 'dotted') {
    const distanceToDot = Math.abs(((along + 4) % 8) - 4);
    const distance = Math.hypot(distanceToDot, side * 0.82);
    return clamp01((1 - distance + 0.08) / 0.16);
  }

  const localX = along - DIRECTION_ARROW_PERIOD / 2;
  const shaft = localX >= -10 && localX <= 2 && Math.abs(side) <= 0.9;
  const arrowHead = localX >= 0 && localX <= 9 && Math.abs(side) <= (9 - localX) * 0.75;
  return shaft || arrowHead ? 1 : 0;
}

function createPatternPixels(pattern: EdgePattern) {
  const width = pattern === 'pulse-arrow' ? 512 : 256;
  const height = pattern === 'pulse-arrow' ? 64 : 32;
  const period = pattern === 'pulse-arrow' ? DIRECTION_ARROW_PERIOD : EDGE_PATTERN_PERIOD;
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const side = ((y + 0.5) / height - 0.5) * (pattern === 'pulse-arrow' ? 12 : 2);
    for (let x = 0; x < width; x++) {
      const along = ((x + 0.5) / width) * period;
      const alpha = getPixelAlpha(pattern, along, side);
      if (alpha <= 0) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return { pixels, width, height };
}

export function createEdgePatternTexture(pattern: EdgePattern) {
  const { pixels, width, height } = createPatternPixels(pattern);
  const source = new BufferImageSource({
    resource: pixels,
    width,
    height,
    format: 'rgba8unorm',
    scaleMode: 'linear',
    addressMode: 'repeat',
  });
  return new Texture({ source, label: `edge-pattern-${pattern}` });
}

export function setEdgePatternOffset(texture: Texture, phase: number) {
  texture.textureMatrix.mapCoord.tx = -phase;
}
