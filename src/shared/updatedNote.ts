const nums = (v: string) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())?.slice(1).map(Number)

/** Was the app updated since a version was last seen? Never on the first start (nothing seen), and not for an older build or a version that cannot be read. */
export function justUpdated(seen: string, running: string): boolean {
  const a = nums(seen)
  const b = nums(running)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i]! > a[i]!
  return false
}

/** Is the version remembered one the app should simply take as its own, without a word: nothing remembered yet, or a newer one than runs now (a downgrade)? */
export function learnsVersion(seen: string, running: string): boolean {
  if (seen === '') return nums(running) !== undefined
  const a = nums(seen)
  const b = nums(running)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!
  return false
}
