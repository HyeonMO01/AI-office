/**
 * 동시에 최대 `limit`개의 비동기 작업만 실행합니다 (네이버 쇼핑 등 병렬 폭주 완화).
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  const n = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  async function workerFn(): Promise<void> {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) {
        return;
      }
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: n }, () => workerFn()));
  return results;
}
