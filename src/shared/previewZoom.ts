/** The steps of a page's zoom, as multiples of the app's own size (which is the page's 100%). */
const STEPS = [0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 2.5, 3]

type Key = { type: string; key: string; meta: boolean; control: boolean; alt: boolean }

/** Whether a key press asks to zoom the page: Command (Control elsewhere) with + or =, - or 0. */
export function zoomKey(k: Key, mac: boolean): 'in' | 'out' | 'reset' | null {
  if (k.type !== 'keyDown' || k.alt || (mac ? !k.meta || k.control : !k.control || k.meta)) return null
  return k.key === '=' || k.key === '+' ? 'in' : k.key === '-' || k.key === '_' ? 'out' : k.key === '0' ? 'reset' : null
}

/** The zoom a page goes to: the next step up or down from where it is, or `base` on reset. */
export function zoomTo(to: 'in' | 'out' | 'reset', factor: number, base: number): number {
  if (to === 'reset') return base
  const at = factor / base
  const step = to === 'in' ? STEPS.find((s) => s > at + 0.001) ?? STEPS[STEPS.length - 1]! : [...STEPS].reverse().find((s) => s < at - 0.001) ?? STEPS[0]!
  return base * step
}
