export function toggleSetValue<Value>(values: Set<Value>, value: Value): Set<Value> {
  const nextValues = new Set(values);
  if (nextValues.has(value)) {
    nextValues.delete(value);
  } else {
    nextValues.add(value);
  }
  return nextValues;
}
