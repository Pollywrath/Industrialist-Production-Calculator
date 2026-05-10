export function sortItems<T>(items: T[], field: keyof T, order: 'asc' | 'desc'): T[] {
  return [...items].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    if (typeof valA === 'string' && typeof valB === 'string') {
      const strA = valA.toLowerCase();
      const strB = valB.toLowerCase();
      return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    }

    const numA = Number(valA || 0);
    const numB = Number(valB || 0);
    return order === 'asc' ? numA - numB : numB - numA;
  });
}
