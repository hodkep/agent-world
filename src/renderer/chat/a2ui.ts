/**
 * A2UI (Google's agent-to-UI format, v0.9) in a reply: an agent writes a ```a2ui block of JSON messages naming components from a
 * small catalog, and the chat draws them. It is data, not code: anything outside the catalog makes the whole block a plain
 * code block. Only the parts a chat needs are read: createSurface, updateComponents, updateDataModel.
 */
export const CATALOG = ['Text', 'Row', 'Column', 'Card', 'Divider', 'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider'] as const

export type A2Component = { id: string; component: string; [k: string]: unknown }
export type Surface = { id: string; components: Record<string, A2Component>; data: Record<string, unknown> }

type Message = { createSurface?: { surfaceId?: string }; updateComponents?: { surfaceId?: string; components?: A2Component[] }; updateDataModel?: { surfaceId?: string; path?: string; value?: unknown } }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MAX_DEPTH = 12

/** The messages in a block: a JSON list, one message, or one message on each line. */
function messagesOf(text: string): Message[] | null {
  const one = (s: string) => {
    try {
      return JSON.parse(s) as unknown
    } catch {
      return undefined
    }
  }
  const whole = one(text)
  const raw = whole !== undefined ? (Array.isArray(whole) ? whole : [whole]) : text.split('\n').filter((l) => l.trim()).map(one)
  return raw.length && raw.every(isObject) ? (raw as Message[]) : null
}

export const childrenOf = (c: A2Component): string[] => {
  const kids = c.children
  return [...(Array.isArray(kids) ? kids.filter((k): k is string => typeof k === 'string') : []), ...(typeof c.child === 'string' ? [c.child] : [])]
}

export function read(data: unknown, path: string): unknown {
  let at = data
  for (const key of path.split('/').filter(Boolean)) {
    if (!isObject(at) && !Array.isArray(at)) return undefined
    at = (at as Record<string, unknown>)[key]
  }
  return at
}

/** A copy of the data with the value at the path set; the old copy is not changed. */
export function write<T extends Record<string, unknown>>(data: T, path: string, value: unknown): T {
  const keys = path.split('/').filter(Boolean)
  if (!keys.length) return (isObject(value) ? value : data) as T
  const set = (at: unknown, i: number): unknown => {
    const base = isObject(at) ? at : {}
    return { ...base, [keys[i]!]: i === keys.length - 1 ? value : set(base[keys[i]!], i + 1) }
  }
  return set(data, 0) as T
}

/** A value in a component is a literal or `{ path }` into the data. */
export const resolve = (v: unknown, data: unknown): unknown => (isObject(v) && typeof v.path === 'string' ? read(data, v.path) : v)

export function parseSurface(text: string): Surface | null {
  const messages = messagesOf(text)
  if (!messages) return null
  let id = ''
  let data: Record<string, unknown> = {}
  const components: Record<string, A2Component> = {}
  let any = false
  for (const m of messages) {
    if (m.createSurface) (id = m.createSurface.surfaceId ?? id), (any = true)
    if (m.updateComponents) {
      any = true
      id ||= m.updateComponents.surfaceId ?? ''
      for (const c of m.updateComponents.components ?? []) {
        if (!isObject(c) || typeof c.id !== 'string' || !(CATALOG as readonly string[]).includes(c.component)) return null
        components[c.id] = c
      }
    }
    if (m.updateDataModel) {
      any = true
      data = write(data, m.updateDataModel.path ?? '/', m.updateDataModel.value)
    }
  }
  if (!any || !components.root) return null
  const walk = (cid: string, depth: number): boolean => {
    const c = components[cid]
    return !!c && depth < MAX_DEPTH && childrenOf(c).every((k) => walk(k, depth + 1))
  }
  return walk('root', 0) ? { id: id || 'surface', components, data } : null
}

/** What the agent is told when a button is pressed: the A2UI action message, with the context read from the data as it is now. */
export function actionText(surface: Surface, componentId: string, data: unknown, now = new Date()): string {
  const c = surface.components[componentId]
  const event = isObject(c?.action) && isObject(c.action.event) ? c.action.event : {}
  const context: Record<string, unknown> = {}
  if (isObject(event.context)) for (const [k, v] of Object.entries(event.context)) context[k] = resolve(v, data)
  const name = typeof event.name === 'string' ? event.name : 'pressed'
  const action = { version: 'v0.9', action: { name, surfaceId: surface.id, sourceComponentId: componentId, timestamp: now.toISOString(), context } }
  return `A2UI action "${name}" (the answer to the form you showed): ${JSON.stringify(action)}`
}
