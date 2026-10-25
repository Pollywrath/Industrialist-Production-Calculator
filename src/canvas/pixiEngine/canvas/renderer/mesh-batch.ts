import { Mesh, MeshGeometry, Texture } from 'pixi.js';
import type { Shader } from 'pixi.js';

export interface TriangleGeometry {
  readonly positions: Float32Array;
  readonly uvs?: Float32Array;
  readonly indices: Uint32Array;
}

export interface TriangleBatchItem extends TriangleGeometry {
  readonly id: string;
}

interface ItemRange {
  readonly positionOffset: number;
  readonly positionLength: number;
  readonly indexOffset: number;
  readonly indexLength: number;
  readonly vertexOffset: number;
}

type FreeRange = ItemRange;

interface UpdatableBuffer {
  readonly destroyed?: boolean;
  readonly data: ArrayBufferView;
  update(sizeInBytes?: number, offsetInBytes?: number): void;
}

interface DirtyRange {
  start: number;
  end: number;
  full: boolean;
}

export class TriangleMeshBatch {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly batchMode: 'auto' | 'batch' | 'no-batch';
  private ranges = new Map<string, ItemRange>();
  private freeRanges: FreeRange[] = [];
  private positionLength = 0;
  private indexLength = 0;
  private updateDepth = 0;
  private dirtyBuffers = new Map<UpdatableBuffer, DirtyRange>();
  private fullUploadPending = new Set<UpdatableBuffer>();

  constructor(
    tint: number,
    texture: Texture = Texture.WHITE,
    shader?: Shader,
    batchMode: 'auto' | 'batch' | 'no-batch' = 'auto',
  ) {
    this.batchMode = batchMode;
    const geometry = this.createGeometry({
      positions: new Float32Array(0),
      uvs: new Float32Array(0),
      indices: new Uint32Array(0),
    });
    this.mesh = new Mesh<MeshGeometry, Shader>({
      geometry,
      texture,
      shader,
    });
    this.mesh.tint = tint;
    this.mesh.visible = false;
  }

  get size() {
    return this.ranges.size;
  }

  markRendered() {
    if (this.mesh.visible) this.fullUploadPending.clear();
  }

  setTexture(texture: Texture) {
    this.mesh.texture = texture;
  }

  batchUpdates<T>(update: () => T): T {
    this.updateDepth++;
    try {
      return update();
    } finally {
      this.updateDepth--;
      if (this.updateDepth === 0) this.flushBufferUpdates();
    }
  }

  has(id: string) {
    return this.ranges.has(id);
  }

  rebuild(items: readonly TriangleBatchItem[]) {
    const positionLength = items.reduce((sum, item) => sum + item.positions.length, 0);
    const uvLength = positionLength;
    const indexLength = items.reduce((sum, item) => sum + item.indices.length, 0);
    const positions = new Float32Array(positionLength);
    const uvs = new Float32Array(uvLength);
    const indices = new Uint32Array(indexLength);
    const ranges = new Map<string, ItemRange>();
    let positionOffset = 0;
    let vertexOffset = 0;
    let indexOffset = 0;

    for (const item of items) {
      positions.set(item.positions, positionOffset);
      if (item.uvs) uvs.set(item.uvs, positionOffset);
      for (let index = 0; index < item.indices.length; index++) {
        indices[indexOffset + index] = item.indices[index] + vertexOffset;
      }
      ranges.set(item.id, {
        positionOffset,
        positionLength: item.positions.length,
        indexOffset,
        indexLength: item.indices.length,
        vertexOffset,
      });
      positionOffset += item.positions.length;
      vertexOffset += item.positions.length / 2;
      indexOffset += item.indices.length;
    }

    this.setGeometryData({ positions, uvs, indices });
    this.ranges = ranges;
    this.freeRanges = [];
    this.positionLength = positionLength;
    this.indexLength = indexLength;
    this.mesh.visible = items.length > 0;
  }

  add(item: TriangleBatchItem) {
    this.addMany([item]);
    return true;
  }

  addMany(items: readonly TriangleBatchItem[]) {
    this.batchUpdates(() => this.addManyInBatch(items));
  }

  private addManyInBatch(items: readonly TriangleBatchItem[]) {
    const appended: TriangleBatchItem[] = [];
    for (const item of items) {
      const existing = this.ranges.get(item.id);
      if (existing) {
        if (
          existing.positionLength === item.positions.length &&
          existing.indexLength === item.indices.length
        ) {
          this.updateGeometry(item.id, item);
          continue;
        }
        this.remove(item.id);
      }

      const freeIndex = this.freeRanges.findIndex(
        (range) =>
          range.positionLength === item.positions.length &&
          range.indexLength === item.indices.length,
      );
      if (freeIndex < 0) {
        appended.push(item);
        continue;
      }
      const range = this.freeRanges.splice(freeIndex, 1)[0];
      this.ranges.set(item.id, range);
      this.writeItem(item, range);
    }

    if (appended.length > 0) {
      const positionLength = appended.reduce((sum, item) => sum + item.positions.length, 0);
      const indexLength = appended.reduce((sum, item) => sum + item.indices.length, 0);
      this.ensureCapacity(this.positionLength + positionLength, this.indexLength + indexLength);
      for (const item of appended) {
        const range: ItemRange = {
          positionOffset: this.positionLength,
          positionLength: item.positions.length,
          indexOffset: this.indexLength,
          indexLength: item.indices.length,
          vertexOffset: this.positionLength / 2,
        };
        this.positionLength += range.positionLength;
        this.indexLength += range.indexLength;
        this.ranges.set(item.id, range);
        this.writeItem(item, range);
      }
    }
    this.mesh.visible = this.ranges.size > 0;
  }

  private writeItem(item: TriangleBatchItem, range: ItemRange) {
    const positionBuffer = this.mesh.geometry.getBuffer('aPosition');
    const positionData = positionBuffer.data as Float32Array;
    const uvBuffer = this.mesh.geometry.getBuffer('aUV');
    const uvData = uvBuffer.data as Float32Array;
    const indexBuffer = this.mesh.geometry.indexBuffer;
    const indexData = indexBuffer.data as Uint32Array;
    positionData.set(item.positions, range.positionOffset);
    if (item.uvs) uvData.set(item.uvs, range.positionOffset);
    else uvData.fill(0, range.positionOffset, range.positionOffset + range.positionLength);
    for (let index = 0; index < item.indices.length; index++) {
      indexData[range.indexOffset + index] = item.indices[index] + range.vertexOffset;
    }
    this.markBufferDirty(
      positionBuffer,
      range.positionLength * Float32Array.BYTES_PER_ELEMENT,
      range.positionOffset * Float32Array.BYTES_PER_ELEMENT,
    );
    this.markBufferDirty(
      uvBuffer,
      range.positionLength * Float32Array.BYTES_PER_ELEMENT,
      range.positionOffset * Float32Array.BYTES_PER_ELEMENT,
    );
    this.markBufferDirty(
      indexBuffer,
      range.indexLength * Uint32Array.BYTES_PER_ELEMENT,
      range.indexOffset * Uint32Array.BYTES_PER_ELEMENT,
    );
  }

  private ensureCapacity(requiredPositionLength: number, requiredIndexLength: number) {
    const current = this.mesh.geometry;
    const currentPositions = current.getBuffer('aPosition').data as Float32Array;
    const currentUvs = current.getBuffer('aUV').data as Float32Array;
    const currentIndices = current.indexBuffer.data as Uint32Array;
    if (
      requiredPositionLength <= currentPositions.length &&
      requiredIndexLength <= currentIndices.length
    )
      return;

    const nextCapacity = (currentLength: number, requiredLength: number) => {
      let capacity = Math.max(8, currentLength);
      while (capacity < requiredLength) capacity *= 2;
      return capacity;
    };
    const positions = new Float32Array(
      nextCapacity(currentPositions.length, requiredPositionLength),
    );
    const uvs = new Float32Array(positions.length);
    const indices = new Uint32Array(nextCapacity(currentIndices.length, requiredIndexLength));
    positions.set(currentPositions);
    uvs.set(currentUvs);
    indices.set(currentIndices);
    this.setGeometryData({ positions, uvs, indices });
  }

  remove(id: string) {
    const range = this.ranges.get(id);
    if (!range) return false;
    const indexBuffer = this.mesh.geometry.indexBuffer;
    const indices = indexBuffer.data as Uint32Array;
    indices.fill(range.vertexOffset, range.indexOffset, range.indexOffset + range.indexLength);
    if (range.indexLength > 0) {
      this.markBufferDirty(
        indexBuffer,
        range.indexLength * Uint32Array.BYTES_PER_ELEMENT,
        range.indexOffset * Uint32Array.BYTES_PER_ELEMENT,
      );
    }
    this.ranges.delete(id);
    this.freeRanges.push(range);
    this.mesh.visible = this.ranges.size > 0;
    return true;
  }

  update(id: string, positions: Float32Array) {
    const range = this.ranges.get(id);
    if (!range || range.positionLength !== positions.length) return false;
    if (range.positionLength === 0) return true;

    const buffer = this.mesh.geometry.getBuffer('aPosition');
    const data = buffer.data as Float32Array;
    data.set(positions, range.positionOffset);
    this.markBufferDirty(
      buffer,
      range.positionLength * Float32Array.BYTES_PER_ELEMENT,
      range.positionOffset * Float32Array.BYTES_PER_ELEMENT,
    );
    return true;
  }

  updateGeometry(id: string, geometry: TriangleGeometry) {
    const range = this.ranges.get(id);
    if (
      !range ||
      range.positionLength !== geometry.positions.length ||
      range.indexLength !== geometry.indices.length
    )
      return false;
    if (range.positionLength === 0) return true;

    const positionBuffer = this.mesh.geometry.getBuffer('aPosition');
    const positionData = positionBuffer.data as Float32Array;
    positionData.set(geometry.positions, range.positionOffset);
    this.markBufferDirty(
      positionBuffer,
      range.positionLength * Float32Array.BYTES_PER_ELEMENT,
      range.positionOffset * Float32Array.BYTES_PER_ELEMENT,
    );

    const uvBuffer = this.mesh.geometry.getBuffer('aUV');
    const uvData = uvBuffer.data as Float32Array;
    if (geometry.uvs) uvData.set(geometry.uvs, range.positionOffset);
    else uvData.fill(0, range.positionOffset, range.positionOffset + range.positionLength);
    this.markBufferDirty(
      uvBuffer,
      range.positionLength * Float32Array.BYTES_PER_ELEMENT,
      range.positionOffset * Float32Array.BYTES_PER_ELEMENT,
    );

    const indexBuffer = this.mesh.geometry.indexBuffer;
    const indexData = indexBuffer.data as Uint32Array;
    for (let index = 0; index < geometry.indices.length; index++) {
      indexData[range.indexOffset + index] = geometry.indices[index] + range.vertexOffset;
    }
    this.markBufferDirty(
      indexBuffer,
      range.indexLength * Uint32Array.BYTES_PER_ELEMENT,
      range.indexOffset * Uint32Array.BYTES_PER_ELEMENT,
    );
    return true;
  }

  private markBufferDirty(buffer: UpdatableBuffer, size: number, offset: number) {
    if (size <= 0) return;
    const full = this.fullUploadPending.has(buffer);
    if (this.updateDepth === 0) {
      buffer.update(full ? buffer.data.byteLength : size, full ? 0 : offset);
      return;
    }
    const range = this.dirtyBuffers.get(buffer);
    if (range) {
      if (full || range.full) {
        range.start = 0;
        range.end = buffer.data.byteLength;
        range.full = true;
      } else {
        range.start = Math.min(range.start, offset);
        range.end = Math.max(range.end, offset + size);
      }
    } else {
      this.dirtyBuffers.set(
        buffer,
        full
          ? { start: 0, end: buffer.data.byteLength, full: true }
          : { start: offset, end: offset + size, full: false },
      );
    }
  }

  private flushBufferUpdates() {
    for (const [buffer, range] of this.dirtyBuffers) {
      if (!buffer.destroyed) {
        buffer.update(
          range.full ? buffer.data.byteLength : range.end - range.start,
          range.full ? 0 : range.start,
        );
      }
    }
    this.dirtyBuffers.clear();
  }

  private createGeometry(options: {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
  }) {
    const geometry = new MeshGeometry(options);
    geometry.batchMode = this.batchMode;
    return geometry;
  }

  private setGeometryData(options: {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
  }) {
    const geometry = this.mesh.geometry;
    geometry.positions = options.positions;
    geometry.uvs = options.uvs;
    geometry.indices = options.indices;
    this.requireFullUpload(geometry.getBuffer('aPosition'));
    this.requireFullUpload(geometry.getBuffer('aUV'));
    this.requireFullUpload(geometry.indexBuffer);
  }

  private requireFullUpload(buffer: UpdatableBuffer) {
    this.fullUploadPending.add(buffer);
    if (this.updateDepth > 0) {
      this.dirtyBuffers.set(buffer, {
        start: 0,
        end: buffer.data.byteLength,
        full: true,
      });
    }
  }

  destroy() {
    this.mesh.parent?.removeChild(this.mesh);
    const geometry = this.mesh.geometry;
    this.mesh.destroy();
    geometry.destroy();
    this.ranges.clear();
    this.freeRanges.length = 0;
    this.dirtyBuffers.clear();
    this.fullUploadPending.clear();
  }
}
