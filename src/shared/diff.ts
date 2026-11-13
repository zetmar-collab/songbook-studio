// Różnice liniowe (LCS) między dwiema wersjami tekstu.

export interface DiffOp {
  type: 'same' | 'add' | 'del'
  text: string
}

const MAX_CELLS = 4_000_000

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split('\n')
  const B = b.split('\n')
  let start = 0
  while (start < A.length && start < B.length && A[start] === B[start]) start++
  let endA = A.length
  let endB = B.length
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--
    endB--
  }
  const midA = A.slice(start, endA)
  const midB = B.slice(start, endB)

  const ops: DiffOp[] = A.slice(0, start).map((text) => ({ type: 'same' as const, text }))

  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    // zbyt duże dla LCS — pokaż po prostu całość jako zmienioną
    for (const text of midA) ops.push({ type: 'del', text })
    for (const text of midB) ops.push({ type: 'add', text })
  } else {
    const n = midA.length
    const m = midB.length
    const w = m + 1
    const dp = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] =
          midA[i] === midB[j]
            ? dp[(i + 1) * w + j + 1] + 1
            : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ type: 'same', text: midA[i] })
        i++
        j++
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        ops.push({ type: 'del', text: midA[i++] })
      } else {
        ops.push({ type: 'add', text: midB[j++] })
      }
    }
    while (i < n) ops.push({ type: 'del', text: midA[i++] })
    while (j < m) ops.push({ type: 'add', text: midB[j++] })
  }

  for (const text of A.slice(endA)) ops.push({ type: 'same', text })
  return ops
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const o of ops) {
    if (o.type === 'add') added++
    else if (o.type === 'del') removed++
  }
  return { added, removed }
}
