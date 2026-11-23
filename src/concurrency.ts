/** Maps over items with at most `limit` calls in flight, keeping the input order in the output. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Runs `fn` with at most `limit` calls in flight across every caller of the returned function. */
export function limiter(limit: number): <R>(fn: () => Promise<R>) => Promise<R> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (fn) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
