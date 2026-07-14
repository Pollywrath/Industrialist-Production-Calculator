export const DEFAULT_SCIP_BUNDLE_PATH = 'scip';

export type ScipBundlePath = typeof DEFAULT_SCIP_BUNDLE_PATH;

const SCIP_BUNDLE_CACHE_VERSION = '2026-07-12-native-abi2-rounded-fast-2';

export function normalizeScipBundlePath(value: unknown): ScipBundlePath {
  if (typeof value === 'string' && value.trim().replace(/^\/+|\/+$/g, '') === 'scip') {
    return DEFAULT_SCIP_BUNDLE_PATH;
  }
  return DEFAULT_SCIP_BUNDLE_PATH;
}

export function getConfiguredScipBundlePath(): ScipBundlePath {
  return normalizeScipBundlePath(import.meta.env.VITE_SCIP_BUNDLE);
}

export function getScipAssetPath(
  fileName: string,
  bundlePath: ScipBundlePath,
  version?: string,
): string {
  const params = new URLSearchParams();
  if (version) {
    params.set('v', version);
  }
  params.set('scipv', SCIP_BUNDLE_CACHE_VERSION);
  return `/${bundlePath}/${fileName}?${params.toString()}`;
}

export function getScipAssetUrl(
  origin: string,
  fileName: string,
  bundlePath: ScipBundlePath,
  version?: string,
): string {
  return `${origin}${getScipAssetPath(fileName, bundlePath, version)}`;
}
