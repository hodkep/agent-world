import type { VoiceState } from './voiceState'

/** What the voice session tells the page, one message at a time. */
export type VoiceOut =
  | { type: 'state'; state: VoiceState; muted: boolean }
  | { type: 'audio'; data: string }
  | { type: 'caption'; who: 'you' | 'it'; text: string }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'tool'; name: string }
  | { type: 'error'; text: string }
  | { type: 'notice'; text: string }

/** A message or todo the voice drafted: the page shows it with Send and Discard. */
export interface DraftShown { id: string; kind: 'message' | 'todo'; to?: string; title?: string; text: string }

export type VoiceEvent = VoiceOut | { type: 'draft'; draft: DraftShown } | { type: 'draftGone'; id: string } | { type: 'ended'; summary: string }
