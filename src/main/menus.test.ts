import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { driveRewind, genericMenu, rewindList } from './menus'

const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('Claude\'s numbered menus, whatever they ask', () => {
  it('reads a permission dialog: what it shows, the question, the options and the highlighted one', () => {
    const m = genericMenu(fixture('menu-permission.txt'))!
    expect(m.title).toBe('Bash command')
    expect(m.context).toContain('echo $(date +%Y)')
    expect(m.context).toContain('Contains command_substitution')
    expect(m.options).toEqual(['Yes', 'No'])
    expect(m.highlighted).toBe(0)
    expect(m.hint).toMatch(/Esc to cancel/)
  })

  it('reads the rewind confirmation', () => {
    const m = genericMenu(fixture('menu-rewind-confirm.txt'))!
    expect(m.title).toBe('Rewind')
    expect(m.context).toContain('Reply with just: two')
    expect(m.options).toEqual(['Restore conversation', 'Summarize from here', 'Summarize up to here', 'Never mind'])
  })

  it('is null for an ordinary screen, a numbered list in a reply, or a list with no cursor', () => {
    expect(genericMenu('❯ hello\n⏺ Steps:\n  1. one\n  2. two\n')).toBeNull()
    expect(genericMenu('  1. Yes\n  2. No\nEsc to cancel')).toBeNull()
  })
})

describe('the rewind list', () => {
  it('reads the prompts you can go back to and which one the cursor is on', () => {
    const l = rewindList(fixture('menu-rewind-list.txt'))!
    expect(l.entries.map((e) => e.text)).toEqual(['Reply with just: one', 'Reply with just: two'])
    expect(l.highlighted).toBe(1)
  })

  it('is null when the rewind list is not on screen', () => {
    expect(rewindList(fixture('menu-permission.txt'))).toBeNull()
  })
})

// A rewind list of five prompts that scrolls: three fit on screen at a time.
function fakeList(n: number, start: number) {
  let at = start
  let entered: number | null = null
  const screen = () => {
    if (entered !== null) return '❯ ok\n'
    const first = Math.max(0, Math.min(n - 3, at - 1))
    const rows = [0, 1, 2].map((i) => `  ${first + i === at ? '❯' : ' '} prompt number ${first + i + 1}\n     No code changes`).join('\n')
    return `Rewind\n   Restore the code and/or conversation to the point before…\n${first > 0 ? `     ↑ ${first} more above\n` : ''}${rows}\n${first + 3 < n ? `     ↓ ${n - first - 3} more below\n` : ''}   Enter to continue · Esc to cancel\n`
  }
  return {
    io: {
      screen,
      write: (k: string) => void (k === '\x1b[A' ? (at = Math.max(0, at - 1)) : k === '\x1b[B' ? (at = Math.min(n - 1, at + 1)) : k === '\r' && (entered = at)),
      sleep: async () => {}
    },
    entered: () => entered
  }
}

describe('going back to a chosen prompt', () => {
  it('moves the cursor to the prompt with that text and presses Enter on it', async () => {
    const f = fakeList(5, 4)
    expect(await driveRewind(f.io, 'prompt number 2')).toBe(true)
    expect(f.entered()).toBe(1)
  })

  it('matches by the start of the text, and gives up without pressing Enter when there is no such prompt', async () => {
    const a = fakeList(5, 4)
    expect(await driveRewind(a.io, 'prompt number 4 and a longer tail than shown')).toBe(false)
    const b = fakeList(5, 4)
    expect(await driveRewind(b.io, 'nothing like it')).toBe(false)
    expect(b.entered()).toBeNull()
  })
})
