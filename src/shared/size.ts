/** A size as people read it: 12 KB, 4.8 MB, 5.6 GB. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let u = 0
  while (v >= 1000 && u < units.length - 1) (v /= 1024, u++)
  return `${v >= 100 || u === 0 && v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[u]}`
}
