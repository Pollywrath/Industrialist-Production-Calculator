export function runRenderFrame<T>(render: () => T, release: () => void): T {
  try {
    return render();
  } finally {
    release();
  }
}
