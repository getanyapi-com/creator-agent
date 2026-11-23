/**
 * Settles with `work`, or rejects the moment `signal` aborts, so a stalled request or response body cannot outlast
 * its deadline whatever the fetch does with the signal.
 */
export function within<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    if (signal.aborted) return stop();
    signal.addEventListener("abort", stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
  });
}
