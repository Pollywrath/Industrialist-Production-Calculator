export interface PixiBackendCapabilities {
  webgpu: boolean;
  webgl: boolean;
}

export async function detectPixiBackendCapabilities(): Promise<PixiBackendCapabilities> {
  const { isWebGLSupported, isWebGPUSupported } = await import('pixi.js');
  const [webgpu, webgl] = await Promise.all([
    isWebGPUSupported().catch(() => false),
    Promise.resolve()
      .then(() => isWebGLSupported(true))
      .catch(() => false),
  ]);
  return { webgpu, webgl };
}
