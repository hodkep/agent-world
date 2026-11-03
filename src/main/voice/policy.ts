import type { VoiceState } from '../../shared/voiceState'

export interface Alert { kind: 'finished' | 'needs-you' | 'failed' | 'started'; agent: string; text: string }
export type SpeakMode = 'silent' | 'milestones' | 'chatty'

/**
 * What to do with news about an agent: say it now, say it at the next pause, or just let the voice know silently.
 * It never talks over the person or itself, keeps to a minute between spoken updates (twenty seconds for something that needs the person),
 * and says nothing to someone who muted the microphone.
 */
export function decide(o: { alert: Alert; mode: SpeakMode; state: VoiceState; sinceTalkMs: number; sinceSpokeMs: number; muted: boolean }): 'speak' | 'later' | 'silent' {
  if (o.mode === 'silent' || o.muted) return 'silent'
  const milestone = o.alert.kind === 'finished' || o.alert.kind === 'needs-you' || o.alert.kind === 'failed'
  if (o.mode === 'milestones' && !milestone) return 'silent'
  if (o.sinceSpokeMs < (o.alert.kind === 'needs-you' ? 20_000 : 60_000)) return 'silent'
  if (o.state !== 'listening' || o.sinceTalkMs < 4000) return 'later'
  return 'speak'
}
