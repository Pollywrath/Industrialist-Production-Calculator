export function discardRoutePreview<T>(
  edgeId: string,
  previews: Map<string, T>,
  restore: (edgeId: string) => void,
) {
  const hadPreview = previews.delete(edgeId);
  restore(edgeId);
  return hadPreview;
}
