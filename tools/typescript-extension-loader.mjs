export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs') &&
    !specifier.endsWith('.ts')
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node report the original resolution error when no TypeScript module exists.
    }
  }

  return nextResolve(specifier, context);
}
