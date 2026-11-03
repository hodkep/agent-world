import type { VoiceCheck } from './types'

/** A saved key told apart from others without giving it away: its first and last four characters. */
export const keyHint = (key: string) => (key.length < 9 ? '' : `${key.slice(0, 4)}••••••••${key.slice(-4)}`)

/** A voice model in words, so the choice does not rest on reading ids. `tag` is a short chip. */
export function modelLabel(name: string, defaultName: string): { note: string; tag: 'default' | 'older' | 'preview' | '' } {
  if (name === defaultName) return { note: 'The one to start with: quick to answer.', tag: 'default' }
  if (name.includes('extended-thinking')) return { note: 'Thinks longer before it answers: slower, costs more.', tag: '' }
  if (name.includes('native-audio')) return { note: 'An older voice model, may be retired soon.', tag: 'older' }
  if (name.includes('preview')) return { note: 'A preview: it may change or be retired.', tag: 'preview' }
  return { note: '', tag: '' }
}

/** Which of the three checks (reaching Google, the key accepted, voice models found) a result failed at; -1 when none did. */
export function stepsFor(r: VoiceCheck): { failAt: number; found: number } {
  if (r.ok) return { failAt: -1, found: r.models.length }
  return { failAt: { unreachable: 0, nokey: 0, invalid: 1, none: 2 }[r.reason], found: 0 }
}

/** The microphone chip next to the switch, from the system's own word for its state. */
export function micChip(status: string): { text: string; tone: 'ok' | 'bad' | 'idle' } {
  if (status === 'granted') return { text: 'microphone allowed', tone: 'ok' }
  if (status === 'denied' || status === 'restricted') return { text: 'microphone blocked in System Settings', tone: 'bad' }
  if (status === 'not-determined') return { text: 'microphone not asked yet', tone: 'idle' }
  return { text: 'microphone state unknown', tone: 'idle' }
}

/** What to tell the person when a talk cannot start, and whether Settings is where to fix it. A reason that is not one of ours is an error's own words. */
export function startProblem(reason: string): { text: string; settings: boolean } {
  if (reason === 'nokey') return { settings: true, text: 'There is no Gemini key saved yet. Add one in Settings under Voice.' }
  if (reason === 'off') return { settings: true, text: 'The voice companion is switched off. Turn it on in Settings under Voice.' }
  if (reason === 'unreadable') return { settings: true, text: 'The saved key cannot be read from the keychain, perhaps because access was denied. Allow it when macOS asks, or save the key again in Settings.' }
  if (reason === 'mic') return { settings: false, text: 'The microphone is blocked. Allow Agent World under System Settings > Privacy & Security > Microphone, then try again.' }
  if (reason === 'nofolder') return { settings: false, text: 'Open a project first.' }
  return { settings: false, text: `The voice companion could not start: ${reason}` }
}
