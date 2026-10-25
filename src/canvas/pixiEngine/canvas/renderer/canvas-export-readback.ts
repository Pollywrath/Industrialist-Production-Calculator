export async function drawCanvasExportTile(
  context: CanvasRenderingContext2D,
  tileCanvas: HTMLCanvasElement,
  tile: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  waitForReadback: () => Promise<void>,
) {
  await waitForReadback();
  context.drawImage(tileCanvas, tile.x, tile.y, tile.width, tile.height);
}
