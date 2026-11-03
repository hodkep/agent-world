/** What the voice companion is doing, as the orb and the words show it. Muted is not a state: it is a flag beside one. */
export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'
export type VoiceEv = 'connect' | 'ready' | 'audio' | 'turnComplete' | 'interrupted' | 'toolCall' | 'toolDone' | 'fail' | 'end'

export function stepVoice(s: VoiceState, ev: VoiceEv): VoiceState {
  if (ev === 'end') return 'idle'
  if (ev === 'connect') return 'connecting'
  if (ev === 'fail') return s === 'idle' ? 'idle' : 'error'
  // Idle waits for a connection and an error only a new one clears.
  if (s === 'idle' || s === 'error') return s
  if (ev === 'ready') return s === 'connecting' ? 'listening' : s
  if (s === 'connecting') return s
  if (ev === 'audio') return 'speaking'
  if (ev === 'turnComplete') return s === 'speaking' ? 'listening' : s
  if (ev === 'interrupted') return s === 'speaking' || s === 'thinking' ? 'listening' : s
  if (ev === 'toolCall') return 'thinking'
  return s
}
