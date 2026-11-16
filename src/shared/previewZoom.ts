/** The steps of a page's zoom. A page's 100% is the browser's own, not the app's zoom. */
const STEPS = [0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 2.5, 3]

type Key = { type: string; key: string; meta: boolean; control: boolean; alt: boolean }

/** Whether a key press asks to zoom the page: Command (Control elsewhere) with + or =, - or 0. */
export function zoomKey(k: Key, mac: boolean): 'in' | 'out' | 'reset' | null {
  if (k.type !== 'keyDown' || k.alt || (mac ? !k.meta || k.control : !k.control || k.meta)) return null
  return k.key === '=' || k.key === '+' ? 'in' : k.key === '-' || k.key === '_' ? 'out' : k.key === '0' ? 'reset' : null
}

/** The zoom a page goes to: the next step up or down from where it is, or 100% on reset. */
export function zoomTo(to: 'in' | 'out' | 'reset', factor: number): number {
  if (to === 'reset') return 1
  return to === 'in' ? STEPS.find((s) => s > factor + 0.001) ?? STEPS[STEPS.length - 1]! : [...STEPS].reverse().find((s) => s < factor - 0.001) ?? STEPS[0]!
}
