/**
 * justified（等高行对齐）布局：贪心装行（对标原版 justified 模式 / Google Photos 风格）
 * 逐个累加宽高比（w/h，即行高为 1 时各项占的宽度），直到按容器宽度求出的行高
 * 降到目标行高以下即封行；最后一行不放大，保持不超过目标行高左对齐
 */

export interface JustifiedRow {
  start: number
  count: number
  height: number
}

/** aspects 为宽高比数组（w/h） */
export function computeJustifiedRows(
  aspects: readonly number[],
  containerWidth: number,
  targetHeight: number,
  gap: number,
): JustifiedRow[] {
  const rows: JustifiedRow[] = []
  let i = 0
  while (i < aspects.length) {
    let aspectSum = 0
    let n = 0
    let height = 0
    while (i + n < aspects.length) {
      aspectSum += aspects[i + n]
      n++
      height = (containerWidth - gap * (n - 1)) / aspectSum
      if (height <= targetHeight) break
    }
    if (i + n >= aspects.length && height > targetHeight) {
      height = targetHeight
    }
    rows.push({ start: i, count: n, height })
    i += n
  }
  return rows
}
