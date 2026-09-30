import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare global {
  interface Window {
    __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
  }
}

const serviceWorker = globalThis as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<{ type?: string }>) => void,
  ) => void;
  skipWaiting: () => Promise<void>;
};

precacheAndRoute(self.__WB_MANIFEST, {
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
});
clientsClaim();

const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api(?:\/|$|\?)/, /^\/scip\/THIRD_PARTY_LICENSES\.txt$/],
  }),
);

registerRoute(
  ({ request, sameOrigin, url }) =>
    sameOrigin &&
    request.destination === 'image' &&
    (url.pathname.startsWith('/icons/') || url.pathname === '/induslogo.webp'),
  new StaleWhileRevalidate({
    cacheName: 'product-icons-v1',
    plugins: [
      {
        cacheKeyWillBeUsed: async ({ request }) => {
          const url = new URL(request.url);
          url.searchParams.delete('v');
          return url.href;
        },
      },
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 250, purgeOnQuotaError: true }),
    ],
  }),
);

registerRoute(
  ({ sameOrigin, url }) => sameOrigin && /^\/scip\/scip\.(?:js|wasm)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'scip-runtime-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 4, purgeOnQuotaError: true }),
    ],
  }),
);

serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void serviceWorker.skipWaiting();
  }
});
