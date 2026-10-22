export type Tone = 'red' | 'amber'
export interface Banner {
  text: string
  tone: Tone
  /** Whether it shows in this moment: the fire drill's sign flashes, the power cut's stays lit. */
  lit: boolean
}

/** The sign over the office while a fire drill or a power cut lasts, as it looks `t` ms into the page's life; nothing for anything else. */
export function bannerFor(event: string, t: number): Banner | null {
  if (event === 'drill') return { text: 'FIRE DRILL', tone: 'red', lit: Math.floor(t / 400) % 2 === 0 }
  if (event === 'cut') return { text: 'POWER CUT', tone: 'amber', lit: true }
  return null
}

/** What each figure that is not an agent is called, in the label shown over its head while the pointer is on it. */
export const ROLE = { cat: 'Cat', supervisor: 'Supervisor', boy: 'Office boy', guard: 'Guard', courier: 'Courier', pizza: 'Pizza delivery' } as const
