export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface Entry<T> {
  readonly bounds: Bounds;
  readonly value: T;
  readonly cells: readonly string[];
  readonly coarseCells: readonly string[];
  readonly centerCell: string | null;
}

const MAX_CELLS_PER_ENTRY = 64;
const MAX_CELLS_PER_QUERY = 4096;
const COARSE_CELL_MULTIPLIER = 16;

function intersects(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export class SpatialIndex<T> {
  private entries = new Map<string, Entry<T>>();
  private buckets = new Map<string, Set<string>>();
  private coarseBuckets = new Map<string, Set<string>>();
  private centerBuckets = new Map<string, Set<string>>();
  private superSized = new Set<string>();
  private boundsCache: Bounds | null = null;
  readonly cellSize: number;

  constructor(cellSize = 512) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error('Spatial index cell size must be a positive finite number.');
    }
    this.cellSize = cellSize;
  }

  get size() {
    return this.entries.size;
  }

  getBounds(): Bounds | null {
    return this.entries.size === 0 ? null : this.boundsCache;
  }

  insert(id: string, bounds: Bounds, value: T) {
    this.remove(id);
    const normalized = {
      minX: Math.min(bounds.minX, bounds.maxX),
      minY: Math.min(bounds.minY, bounds.maxY),
      maxX: Math.max(bounds.minX, bounds.maxX),
      maxY: Math.max(bounds.minY, bounds.maxY),
    };
    this.boundsCache = this.boundsCache
      ? {
          minX: Math.min(this.boundsCache.minX, normalized.minX),
          minY: Math.min(this.boundsCache.minY, normalized.minY),
          maxX: Math.max(this.boundsCache.maxX, normalized.maxX),
          maxY: Math.max(this.boundsCache.maxY, normalized.maxY),
        }
      : normalized;
    const width = normalized.maxX - normalized.minX;
    const height = normalized.maxY - normalized.minY;
    if (width <= this.cellSize * 2 && height <= this.cellSize * 2) {
      const centerX = Math.floor((normalized.minX + normalized.maxX) / 2 / this.cellSize);
      const centerY = Math.floor((normalized.minY + normalized.maxY) / 2 / this.cellSize);
      const centerCell = this.cellKey(centerX, centerY);
      let bucket = this.centerBuckets.get(centerCell);
      if (!bucket) this.centerBuckets.set(centerCell, (bucket = new Set()));
      bucket.add(id);
      this.entries.set(id, { bounds: normalized, value, cells: [], coarseCells: [], centerCell });
      return;
    }
    const cellRange = this.getCellRange(normalized);
    const cellCount = (cellRange.maxX - cellRange.minX + 1) * (cellRange.maxY - cellRange.minY + 1);
    if (cellCount > MAX_CELLS_PER_ENTRY) {
      const coarseRange = this.getCellRange(normalized, this.cellSize * COARSE_CELL_MULTIPLIER);
      const coarseCount =
        (coarseRange.maxX - coarseRange.minX + 1) * (coarseRange.maxY - coarseRange.minY + 1);
      if (coarseCount > MAX_CELLS_PER_ENTRY) {
        this.entries.set(id, {
          bounds: normalized,
          value,
          cells: [],
          coarseCells: [],
          centerCell: null,
        });
        this.superSized.add(id);
        return;
      }
      const coarseCells: string[] = [];
      for (let x = coarseRange.minX; x <= coarseRange.maxX; x++) {
        for (let y = coarseRange.minY; y <= coarseRange.maxY; y++) {
          const cell = this.cellKey(x, y);
          coarseCells.push(cell);
          let bucket = this.coarseBuckets.get(cell);
          if (!bucket) this.coarseBuckets.set(cell, (bucket = new Set()));
          bucket.add(id);
        }
      }
      this.entries.set(id, { bounds: normalized, value, cells: [], coarseCells, centerCell: null });
      return;
    }

    const cells: string[] = [];
    for (let x = cellRange.minX; x <= cellRange.maxX; x++) {
      for (let y = cellRange.minY; y <= cellRange.maxY; y++) {
        const cell = this.cellKey(x, y);
        cells.push(cell);
        let bucket = this.buckets.get(cell);
        if (!bucket) this.buckets.set(cell, (bucket = new Set()));
        bucket.add(id);
      }
    }
    this.entries.set(id, { bounds: normalized, value, cells, coarseCells: [], centerCell: null });
  }

  update(id: string, bounds: Bounds, value: T) {
    this.insert(id, bounds, value);
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.superSized.delete(id);
    if (entry.centerCell) {
      const bucket = this.centerBuckets.get(entry.centerCell);
      bucket?.delete(id);
      if (bucket?.size === 0) this.centerBuckets.delete(entry.centerCell);
    }
    for (const cell of entry.cells) {
      const bucket = this.buckets.get(cell);
      bucket?.delete(id);
      if (bucket?.size === 0) this.buckets.delete(cell);
    }
    for (const cell of entry.coarseCells) {
      const bucket = this.coarseBuckets.get(cell);
      bucket?.delete(id);
      if (bucket?.size === 0) this.coarseBuckets.delete(cell);
    }
    return true;
  }

  clear() {
    this.entries.clear();
    this.buckets.clear();
    this.coarseBuckets.clear();
    this.centerBuckets.clear();
    this.superSized.clear();
    this.boundsCache = null;
  }

  query(bounds: Bounds) {
    const normalized = {
      minX: Math.min(bounds.minX, bounds.maxX),
      minY: Math.min(bounds.minY, bounds.maxY),
      maxX: Math.max(bounds.minX, bounds.maxX),
      maxY: Math.max(bounds.minY, bounds.maxY),
    };
    const range = this.getCellRange(normalized);
    const count = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    const candidates = new Set(this.superSized);
    if (count > MAX_CELLS_PER_QUERY) {
      for (const id of this.entries.keys()) candidates.add(id);
    } else {
      for (let x = range.minX; x <= range.maxX; x++) {
        for (let y = range.minY; y <= range.maxY; y++) {
          for (const id of this.buckets.get(this.cellKey(x, y)) ?? []) candidates.add(id);
        }
      }
      const coarseRange = this.getCellRange(normalized, this.cellSize * COARSE_CELL_MULTIPLIER);
      for (let x = coarseRange.minX; x <= coarseRange.maxX; x++) {
        for (let y = coarseRange.minY; y <= coarseRange.maxY; y++) {
          for (const id of this.coarseBuckets.get(this.cellKey(x, y)) ?? []) candidates.add(id);
        }
      }
      const expandedRange = this.getCellRange({
        minX: normalized.minX - this.cellSize,
        minY: normalized.minY - this.cellSize,
        maxX: normalized.maxX + this.cellSize,
        maxY: normalized.maxY + this.cellSize,
      });
      for (let x = expandedRange.minX; x <= expandedRange.maxX; x++) {
        for (let y = expandedRange.minY; y <= expandedRange.maxY; y++) {
          for (const id of this.centerBuckets.get(this.cellKey(x, y)) ?? []) candidates.add(id);
        }
      }
    }

    const result: T[] = [];
    for (const id of candidates) {
      const entry = this.entries.get(id);
      if (entry && intersects(entry.bounds, normalized)) result.push(entry.value);
    }
    return result;
  }

  private getCellRange(bounds: Bounds, size = this.cellSize) {
    return {
      minX: Math.floor(bounds.minX / size),
      minY: Math.floor(bounds.minY / size),
      maxX: Math.floor(bounds.maxX / size),
      maxY: Math.floor(bounds.maxY / size),
    };
  }

  private cellKey(x: number, y: number) {
    return `${x}:${y}`;
  }
}
