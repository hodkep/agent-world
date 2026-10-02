/** How long ago, in the biggest units that read well: "3d 4h ago", "6h ago", "12m ago". */
export function agoLabel(at: number | null, now: number): string {
  if (at === null) return 'unknown'
  const s = Math.max(0, now - at) / 1000
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d >= 1) return `${d}d ${h % 24}h ago`
  if (h >= 1) return `${h}h ago`
  return `${m}m ago`
}

/** A length of time: "1h 12m", "48m", "30s". */
export function durationLabel(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h >= 1) return `${h}h ${m % 60}m`
  if (m >= 1) return `${m}m`
  return `${s}s`
}

/** A playful level from lines changed (more of them, higher), and how far it is to the next. */
export function levelOf(lines: number): { level: number; pct: number } {
  const n = Math.max(0, lines) / 12
  const level = Math.max(1, Math.min(99, Math.floor(Math.sqrt(n))))
  const base = level * level
  const next = (level + 1) * (level + 1)
  return { level, pct: Math.max(0, Math.min(99, Math.round(((n - base) / (next - base)) * 100))) }
}
