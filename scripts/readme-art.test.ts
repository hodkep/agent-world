import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('the README art script', () => {
  const out = mkdtempSync(join(tmpdir(), 'aw-readme-art-'))
  execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/readme-art.mjs'], { env: { ...process.env, README_ART_OUT: out }, stdio: 'pipe' })

  it('draws a banner in the app\'s palette as plain SVG rectangles, small enough for a README', () => {
    const svg = readFileSync(join(out, 'banner.svg'), 'utf8')
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).toContain('aria-label="Agent World')
    expect(svg).toContain('#f2c230')
    expect(svg).not.toMatch(/<image|<text|font-family/)
    expect(statSync(join(out, 'banner.svg')).size).toBeLessThan(200_000)
  })

  it('draws every section icon on a 12 by 12 grid, with nothing but rectangles in it', () => {
    const icons = readdirSync(join(out, 'icons'))
    expect(icons).toEqual(expect.arrayContaining(['office.svg', 'chat.svg', 'permission.svg', 'worktrees.svg', 'workflows.svg', 'library.svg', 'todos.svg', 'usage.svg', 'agents.svg']))
    for (const f of icons) {
      const svg = readFileSync(join(out, 'icons', f), 'utf8')
      expect(svg).toContain('viewBox="0 0 12 12"')
      expect(svg).not.toMatch(/<image|<text|<path/)
    }
  })
})
