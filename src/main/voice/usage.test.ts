import { describe, expect, it } from 'vitest'
import { voiceCost } from './usage'

describe('what a turn of talk costs', () => {
  it('prices each kind of token at its own rate', () => {
    // 1M text in at $0.75, 1M audio in at $3, 1M audio out at $12, 1M text out at $4.50, 1M thinking at the text-out rate.
    const usd = voiceCost({
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000_000 }, { modality: 'AUDIO', tokenCount: 1_000_000 }],
      responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 1_000_000 }, { modality: 'TEXT', tokenCount: 1_000_000 }],
      thoughtsTokenCount: 1_000_000
    })
    expect(usd).toBeCloseTo(0.75 + 3 + 12 + 4.5 + 4.5, 6)
  })
  it('works out the answer the POC saw: a short spoken reply costs a fraction of a cent', () => {
    const usd = voiceCost({ promptTokensDetails: [{ modality: 'TEXT', tokenCount: 766 }, { modality: 'AUDIO', tokenCount: 205 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 160 }], thoughtsTokenCount: 55 })
    expect(usd).toBeGreaterThan(0.002)
    expect(usd).toBeLessThan(0.005)
  })
  it('counts the tokens of a modality it does not know at the text rate, and nothing for missing fields', () => {
    expect(voiceCost({ promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 1_000_000 }] })).toBeCloseTo(0.75, 6)
    expect(voiceCost({})).toBe(0)
  })
})
