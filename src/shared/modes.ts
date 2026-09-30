/** Claude Code's permission modes, as the interface names them, with what each means and how the app shows it. */
export interface ModeInfo {
  id: string
  label: string
  blurb: string
  /** Its colour everywhere: the chat, the roster and the character's badge. */
  color: number
  /** A 5x5 pixel glyph ('#' filled) for the character's name tag; the default mode has none. */
  glyph?: string[]
}

export const MODES: ModeInfo[] = [
  { id: 'default', label: 'Ask first', blurb: 'Asks before edits and most commands.', color: 0xa4a2b8 },
  { id: 'acceptEdits', label: 'Edit automatically', blurb: 'File edits go through; commands still ask.', color: 0xf2c230, glyph: ['..##.', '.###.', '###..', '##...', '#....'] },
  { id: 'plan', label: 'Plan', blurb: 'Reads and plans. Changes nothing until you approve the plan.', color: 0x6ad0e0, glyph: ['#.###', '.....', '#.###', '.....', '#.###'] },
  { id: 'auto', label: 'Auto', blurb: 'A classifier approves the safe actions for you.', color: 0xff9a3c, glyph: ['..##.', '.##..', '.###.', '..##.', '.##..'] },
  { id: 'dontAsk', label: "Don't ask", blurb: 'Only pre-approved tools run; everything else is denied.', color: 0xb070e0, glyph: ['.###.', '#...#', '#####', '##.##', '#####'] },
  { id: 'bypassPermissions', label: 'Bypass', blurb: 'Nothing is asked. Only for a sandbox.', color: 0xd83a3a, glyph: ['.###.', '#.#.#', '#####', '.###.', '.#.#.'] }
]

export const modeInfo = (mode: string | undefined): ModeInfo => MODES.find((m) => m.id === (mode ?? 'default')) ?? MODES[0]!
export const modeLabel = (mode: string | undefined) => modeInfo(mode).label
export const cssColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`
/** The modes worth offering in the picker: bypass stays a deliberate choice at hire time. */
export const PICKABLE_MODES = MODES.filter((m) => m.id !== 'bypassPermissions')
