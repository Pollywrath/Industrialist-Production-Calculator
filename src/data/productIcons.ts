const ALIAS_MAP: Record<string, string> = {
  p_2x_microchip: 'p_logic_plate',
  p_4x_microchip: 'p_logic_plate',
  p_8x_microchip: 'p_logic_plate',
  p_16x_microchip: 'p_logic_plate',
  p_32x_microchip: 'p_logic_plate',
  p_64x_microchip: 'p_logic_plate',
  p_2x64x_microchip: 'p_logic_plate',
  p_3x64x_microchip: 'p_logic_plate',
  p_4x64x_microchip: 'p_logic_plate',
  p_5x64x_microchip: 'p_logic_plate',
  p_6x64x_microchip: 'p_logic_plate',
  p_7x64x_microchip: 'p_logic_plate',
  p_8x64x_microchip: 'p_logic_plate',
  any_fluid: 'p_logic_plate',
  any_item: 'p_logic_plate',
  p_microchip_scrap: 'p_logic_plate',
};

export const ASSET_VERSION = import.meta.env.VITE_ICON_VERSION || 'dev';

function withAssetVersion(path: string): string {
  return `${path}?v=${ASSET_VERSION}`;
}

export const INDUS_LOGO_SRC = withAssetVersion('/induslogo.webp');

export function getProductIconPath(productId: string): string | null {
  const effectiveId = ALIAS_MAP[productId] || productId;

  return withAssetVersion(`/icons/${effectiveId}.webp`);
}
