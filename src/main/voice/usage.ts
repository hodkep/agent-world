interface Detail { modality?: string; tokenCount?: number }
/** What Gemini Live reports for a turn (`usageMetadata`), the parts that carry a price. */
export interface VoiceUsage { promptTokensDetails?: Detail[]; responseTokensDetails?: Detail[]; thoughtsTokenCount?: number }

// Dollars per million tokens (Google's price table for the Live models): audio costs far more than text, and thinking is billed as text out.
const IN = { text: 0.75, audio: 3 }
const OUT = { text: 4.5, audio: 12 }

/** What one turn cost, from its tokens by kind. A kind it does not know is counted at the text rate. */
export function voiceCost(u: VoiceUsage): number {
  const sum = (ds: Detail[] | undefined, rate: { text: number; audio: number }) => (ds ?? []).reduce((t, d) => t + ((d.tokenCount ?? 0) * (d.modality === 'AUDIO' ? rate.audio : rate.text)) / 1e6, 0)
  return sum(u.promptTokensDetails, IN) + sum(u.responseTokensDetails, OUT) + ((u.thoughtsTokenCount ?? 0) * OUT.text) / 1e6
}
