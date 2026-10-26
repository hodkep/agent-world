import { describe, expect, it } from 'vitest'
import { MERMAID_CONFIG } from './mermaidConfig'

describe('how a Mermaid diagram in a reply is drawn', () => {
  it('looks hand-drawn, in the app\'s colours, and never lets a diagram run script or load HTML', () => {
    expect(MERMAID_CONFIG.look).toBe('handDrawn')
    expect(MERMAID_CONFIG.securityLevel).toBe('strict')
    expect(MERMAID_CONFIG.startOnLoad).toBe(false)
    expect(MERMAID_CONFIG.flowchart?.htmlLabels).toBe(false)
    expect(MERMAID_CONFIG.themeVariables?.primaryBorderColor).toBe('#f2c230')
  })
})
