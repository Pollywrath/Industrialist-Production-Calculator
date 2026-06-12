export function sortItems<T>(items: T[], field: keyof T, order: 'asc' | 'desc'): T[] {
  return [...items].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    if (typeof valA === 'string' && typeof valB === 'string') {
      const strA = valA.toLowerCase();
      const strB = valB.toLowerCase();
      if (strA === 'infinity' || strB === 'infinity') {
        const numA = strA === 'infinity' ? Infinity : Number(valA || 0);
        const numB = strB === 'infinity' ? Infinity : Number(valB || 0);
        if (numA === numB) return 0;
        const diff = numA - numB;
        return order === 'asc' ? diff : -diff;
      }
      return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    }

    const numA = typeof valA === 'string' && valA.toLowerCase() === 'infinity' ? Infinity : Number(valA || 0);
    const numB = typeof valB === 'string' && valB.toLowerCase() === 'infinity' ? Infinity : Number(valB || 0);
    if (numA === numB) return 0;
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    const diff = numA - numB;
    return order === 'asc' ? diff : -diff;
  });
}
