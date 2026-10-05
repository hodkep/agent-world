type Model = { value: string; label: string; efforts?: string[] }
export const ALL_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const family = (label: string) => label.replace(/\s*\(.*\)\s*$/, '').toLowerCase()

/**
 * The model an agent runs: by the id it was hired with, else by the name its program shows. A program that lists a model once
 * per level ("Gemini 3.8 Flash (High)") shows the name and the level apart in its footer, so both are matched.
 */
export function modelOf(models: Model[], id?: string, shown?: string | null, level?: string | null): Model | undefined {
  if (id) {
    const hit = models.find((m) => m.value === id)
    if (hit) return hit
  }
  const name = family(shown ?? '')
  if (!name) return undefined
  const same = models.filter((m) => m.value && family(m.label) === name)
  return same.find((m) => level && m.label.toLowerCase().includes(`(${level.toLowerCase()})`)) ?? same[0]
}

/** The thinking levels to offer for a model: a program that lists them per model says so (none for agy); for Claude every level is offered. */
export function effortsFor(models: Model[], id?: string, shown?: string | null, level?: string | null): string[] {
  if (!models.some((m) => m.efforts)) return ALL_EFFORTS
  return modelOf(models, id, shown, level)?.efforts ?? []
}

/** Launch options a program can actually take: a model it does not list, or a thinking level its model does not offer, is dropped (a role made for Claude, hired onto agy). */
export function fitOptions<T extends { model?: string; effort?: string }>(models: Model[], options: T): T {
  const { model, effort, ...rest } = options
  const keepModel = model && models.some((m) => m.value === model) ? model : undefined
  const keepEffort = effort && effortsFor(models, keepModel).includes(effort) ? effort : undefined
  return { ...rest, ...(keepModel && { model: keepModel }), ...(keepEffort && { effort: keepEffort }) } as T
}
