export async function detectPixiWebGLSupport(): Promise<boolean> {
  const { isWebGLSupported } = await import('pixi.js');
  return Promise.resolve()
    .then(() => isWebGLSupported(true))
    .catch(() => false);
}
