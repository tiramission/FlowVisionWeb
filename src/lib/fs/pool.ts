/** 固定并发数的任务池，用于限制文件 IO 的并行度 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onDone?: (done: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      results[i] = await fn(items[i])
      done++
      onDone?.(done)
    }
  })
  await Promise.all(workers)
  return results
}
