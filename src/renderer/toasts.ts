import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  text: string
  tone: 'bad' | 'ok'
}

const MAX = 4
let list: Toast[] = []
let next = 1
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** The words of an error from the main process, without the "Error invoking remote method" wrapper. */
const words = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Shows a message on top of the whole window. A message already showing is not stacked again; an error (or a string) is a problem unless `tone` says it went well. */
export function toast(what: unknown, tone: Toast['tone'] = 'bad') {
  const text = words(what)
  if (!list.some((t) => t.text === text && t.tone === tone)) list = [...list, { id: next++, text, tone }].slice(-MAX)
  emit()
}
export function dismissToast(id: number) {
  list = list.filter((t) => t.id !== id)
  emit()
}
export const toasts = () => list
export const resetToasts = () => ((list = []), emit())
export const useToasts = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => list
  )
