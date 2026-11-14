/** The few colours a look's picture is drawn from: what its own CSS sets on these variables, else the system's. */
export interface Swatch {
  bg: string
  panel: string
  accent: string
  paper: string
}
export const SWATCH_DEFAULT: Swatch = { bg: '#12101a', panel: '#1a1726', accent: '#f2c230', paper: '#f6f6fa' }

// Only a plain colour is taken: the value goes into an inline style, so nothing else may pass.
const COLOUR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([0-9a-z .,%/+-]*\))$/i

export function swatchOf(css: string): Swatch {
  const out = { ...SWATCH_DEFAULT }
  for (const [, name, value] of css.matchAll(/--(bg|panel|accent|paper)\s*:\s*([^;}]*)/g)) {
    const v = value!.trim()
    if (COLOUR.test(v)) out[name as keyof Swatch] = v
  }
  return out
}
