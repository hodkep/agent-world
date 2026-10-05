type Model = { value: string; label: string; efforts?: string[] }
export const ALL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

/** The model an agent runs: by the id it was hired with (a level on the end is ignored), else by the name its program shows. */
export function modelOf(models: Model[], id?: string, shown?: string | null): Model | undefined {
  const base = (id ?? '').replace(/-(low|medium|high)$/, '')
  if (base) {
    const hit = models.find((m) => m.value === base || m.value === id)
    if (hit) return hit
  }
  const name = (shown ?? '').replace(/\s*\(.*\)\s*$/, '').toLowerCase()
  return name ? models.find((m) => m.value && m.label.toLowerCase() === name) : undefined
}

/** The thinking levels to offer for a model: a program that lists them per model (agy) says so; for Claude every level is offered. */
export function effortsFor(models: Model[], id?: string, shown?: string | null): string[] {
  if (!models.some((m) => m.efforts)) return ALL_EFFORTS
  return modelOf(models, id, shown)?.efforts ?? []
}
