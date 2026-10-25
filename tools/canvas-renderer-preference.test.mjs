import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const storage = new MemoryStorage();
storage.setItem(
  'industrialist_edge_theme_v1',
  JSON.stringify({ lineStyle: 'dotted', pathStyle: 'straight', animationStyle: 'none' }),
);
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
});

const viteServer = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
});
const rendererStore = await viteServer.ssrLoadModule('/src/stores/useCanvasRendererStore.ts');
const edgeStore = await viteServer.ssrLoadModule('/src/stores/useEdgeThemeStore.ts');

after(async () => viteServer.close());

test('renderer preference defaults to WebGPU and rejects unknown stored values', () => {
  const state = rendererStore.useCanvasRendererStore.getState();
  assert.equal(state.preference, 'pixi-webgpu');
  assert.equal(rendererStore.resolveCanvasRendererPreference(null), 'pixi-webgpu');
  assert.equal(rendererStore.resolveCanvasRendererPreference('canvas-2d'), 'pixi-webgpu');
  assert.equal(rendererStore.resolveCanvasRendererPreference('react-flow'), 'react-flow');
});

test('new edge defaults are orthogonal, solid, and pulse arrows while saved preferences persist', () => {
  assert.equal(edgeStore.DEFAULT_EDGE_PATH_STYLE, 'orthogonal');
  assert.equal(edgeStore.DEFAULT_EDGE_LINE_STYLE, 'solid');
  assert.equal(edgeStore.DEFAULT_EDGE_ANIMATION_STYLE, 'pulse-arrow');
  assert.deepEqual(
    {
      lineStyle: edgeStore.useEdgeThemeStore.getState().lineStyle,
      pathStyle: edgeStore.useEdgeThemeStore.getState().pathStyle,
      animationStyle: edgeStore.useEdgeThemeStore.getState().animationStyle,
    },
    { lineStyle: 'dotted', pathStyle: 'straight', animationStyle: 'none' },
  );
});

test('renderer preference persists locally and keeps active renderer separate', () => {
  const state = rendererStore.useCanvasRendererStore.getState();
  state.setPreference('pixi-webgl');
  assert.equal(storage.getItem(rendererStore.CANVAS_RENDERER_STORAGE_KEY), 'pixi-webgl');
  assert.equal(
    rendererStore.resolveCanvasRendererPreference(
      storage.getItem(rendererStore.CANVAS_RENDERER_STORAGE_KEY),
    ),
    'pixi-webgl',
  );

  rendererStore.useCanvasRendererStore.getState().setActiveRenderer('react-flow');
  assert.equal(rendererStore.useCanvasRendererStore.getState().preference, 'pixi-webgl');
  assert.equal(rendererStore.useCanvasRendererStore.getState().activeRenderer, 'react-flow');
});

test('backend fallback order honors the preferred GPU and filters unavailable backends', () => {
  assert.deepEqual(rendererStore.getPixiBackendOrder('pixi-webgpu'), ['webgpu', 'webgl']);
  assert.deepEqual(rendererStore.getPixiBackendOrder('pixi-webgl'), ['webgl', 'webgpu']);
  assert.deepEqual(
    rendererStore.getAvailablePixiBackends('pixi-webgpu', { webgpu: false, webgl: true }),
    ['webgl'],
  );
  assert.deepEqual(
    rendererStore.getAvailablePixiBackends('pixi-webgl', { webgpu: false, webgl: false }),
    [],
  );
  assert.equal(rendererStore.isRendererChoiceAvailable('pixi-webgpu', 'available'), true);
  assert.equal(rendererStore.isRendererChoiceAvailable('pixi-webgl', 'unavailable'), false);
  assert.equal(rendererStore.isRendererChoiceAvailable('pixi-webgpu', 'unknown'), false);
  assert.equal(rendererStore.isRendererChoiceAvailable('react-flow', 'unavailable'), true);
});

test('fallback notice is dismissible without changing the saved preference', () => {
  const state = rendererStore.useCanvasRendererStore.getState();
  state.showFallbackNotice();
  assert.equal(rendererStore.useCanvasRendererStore.getState().fallbackNoticeVisible, true);
  rendererStore.useCanvasRendererStore.getState().dismissFallbackNotice();
  assert.equal(rendererStore.useCanvasRendererStore.getState().fallbackNoticeVisible, false);
  assert.equal(rendererStore.useCanvasRendererStore.getState().preference, 'pixi-webgl');
});
