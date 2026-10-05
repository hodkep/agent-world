import type { ProviderId } from './types'

/** How each program looks wherever the office tells them apart: its name, the short name for a tag, and its colour (the same on the swatch, the tanks and the setup mark). */
export const BRAND: Record<ProviderId, { short: string; color: number }> = {
  claude: { short: 'Claude Code', color: 0xe08a5a },
  agy: { short: 'agy', color: 0x6ad0e0 }
}

export const cssColor = (id: ProviderId) => `#${BRAND[id].color.toString(16).padStart(6, '0')}`
