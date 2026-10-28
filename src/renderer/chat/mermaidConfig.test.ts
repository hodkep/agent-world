import { describe, expect, it } from 'vitest'
import { MERMAID_CONFIG } from './mermaidConfig'

describe('how a Mermaid diagram in a reply is drawn', () => {
  it('looks hand-drawn, in the app\'s colours, and never lets a diagram run script or load HTML', () => {
    expect(MERMAID_CONFIG.look).toBe('handDrawn')
    expect(MERMAID_CONFIG.securityLevel).toBe('strict')
    expect(MERMAID_CONFIG.startOnLoad).toBe(false)
    expect(MERMAID_CONFIG.flowchart?.htmlLabels).toBe(false)
    // Lines and boxes are sketched; the words are in the app's own reading font, since a handwriting font was hard to read.
    expect(MERMAID_CONFIG.fontFamily).toMatch(/^system-ui/)
    expect(MERMAID_CONFIG.themeVariables?.fontSize).toBe('15px')
    expect(MERMAID_CONFIG.themeVariables?.primaryBorderColor).toBe('#f2c230')
  })

  // gitGraph, mindmap, timeline, gantt and quadrantChart read these variables, and fall back to black on our dark panels when they are not set.
  const v = (k: string) => (MERMAID_CONFIG.themeVariables as Record<string, string>)[k]!
  const light = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  it('gives every git branch a line colour that shows on a dark panel, and a label colour that shows on that line', () => {
    for (let i = 0; i < 8; i++) {
      expect(v(`git${i}`), `git${i}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(light(v(`git${i}`)), `git${i}`).toBeGreaterThan(110)
      expect(light(v(`gitBranchLabel${i}`)), `gitBranchLabel${i}`).toBeLessThan(60)
    }
    expect(light(v('commitLabelColor'))).toBeGreaterThan(180)
    expect(light(v('tagLabelColor'))).toBeGreaterThan(110)
  })
  it('keeps the commit labels, turned along the line so they do not run over the tags', () => {
    expect(MERMAID_CONFIG.gitGraph).toMatchObject({ showCommitLabel: true, rotateCommitLabel: true })
  })
  it('colours mindmap and timeline sections, gantt bars and quadrant fills, with words that read on them', () => {
    for (let i = 0; i < 8; i++) {
      expect(light(v(`cScale${i}`)), `cScale${i}`).toBeLessThan(90)
      expect(light(v(`cScaleLabel${i}`)), `cScaleLabel${i}`).toBeGreaterThan(180)
    }
    for (const k of ['taskBkgColor', 'activeTaskBkgColor', 'doneTaskBkgColor', 'quadrant1Fill', 'quadrant2Fill', 'quadrant3Fill', 'quadrant4Fill']) expect(light(v(k)), k).toBeLessThan(90)
    for (const k of ['taskTextColor', 'taskTextOutsideColor', 'quadrant1TextFill', 'quadrantPointTextFill', 'quadrantTitleFill']) expect(light(v(k)), k).toBeGreaterThan(180)
  })
})
