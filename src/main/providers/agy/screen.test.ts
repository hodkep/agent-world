import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TerminalIO } from '../ports'
import { agyScreen } from './screen'

// Rendered screens of a real agy 1.2.17 session (110x32), with the account and folder names replaced.
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', `${n}.txt`), 'utf8')
const s = agyScreen

describe('reading what agy is doing', () => {
  it('is ready for a message at an idle prompt, and not while it works or asks', () => {
    expect(s.inputReady(fx('idle'))).toBe(true)
    expect(s.inputReady(fx('mode-plan'))).toBe(true)
    expect(s.inputReady(fx('interrupted'))).toBe(true)
    expect(s.inputReady(fx('working'))).toBe(false)
    expect(s.inputReady(fx('permission'))).toBe(false)
    expect(s.inputReady(fx('trust'))).toBe(false)
  })
  it('is still ready when something is typed, though the footer then drops its shortcut hint', () => {
    expect(s.inputReady(fx('idle').replace('? for shortcuts', '               '))).toBe(true)
    expect(s.readMode(fx('mode-plan').replace('? for shortcuts', '               '))).toBe('plan')
  })
  it('knows it is working from the spinner line, and not when idle or asking', () => {
    expect(s.looksWorking(fx('working'))).toBe(true)
    expect(s.looksWorking(fx('idle'))).toBe(false)
    expect(s.looksWorking(fx('interrupted'))).toBe(false)
    expect(s.looksWorking(fx('permission'))).toBe(false)
  })
  it('sees a menu open: the permission question and the trust question', () => {
    expect(s.anyMenu(fx('permission'))).toBe(true)
    expect(s.anyMenu(fx('trust'))).toBe(true)
    expect(s.anyMenu(fx('idle'))).toBe(false)
    expect(s.anyMenu(fx('working'))).toBe(false)
  })
})

describe('the permission menu', () => {
  it('reads what is asked and the options, with the cursor on the first', () => {
    const m = s.genericMenu(fx('permission'))!
    expect(m.title).toBe('Requesting permission')
    expect(m.context).toBe('sleep 4')
    expect(m.options).toHaveLength(4)
    expect(m.options[0]).toBe('Yes, run command')
    expect(m.options[3]).toBe('No, cancel')
    expect(m.highlighted).toBe(0)
    expect(m.hint).toMatch(/Navigate/)
  })
  it('is not read from an idle screen', () => {
    expect(s.genericMenu(fx('idle'))).toBeNull()
  })
})

describe('the trust menu', () => {
  it('reads the folder and the highlighted answer', () => {
    expect(s.trustPrompt(fx('trust'))).toEqual({ path: '/work/project', highlighted: 'yes' })
    expect(s.trustPrompt(fx('idle'))).toBeNull()
  })
})

describe('the autonomy level in the footer', () => {
  it('names accept-edits and plan, and calls an unlabelled footer request-review', () => {
    expect(s.readMode(fx('mode-accept'))).toBe('accept-edits')
    expect(s.readMode(fx('mode-plan'))).toBe('plan')
    expect(s.readMode(fx('idle'))).toBe('request-review')
  })
  it('cannot tell while it works or asks, where the footer shows something else', () => {
    expect(s.readMode(fx('working'))).toBeNull()
    expect(s.readMode(fx('permission'))).toBeNull()
  })
})

describe('what agy cannot do from here', () => {
  it('has no rewind list, side questions or plan menu to read', () => {
    expect(s.rewindList(fx('idle'))).toBeNull()
    expect(s.btwOverlay(fx('idle'))).toBeNull()
    expect(s.planMenu(fx('idle'))).toBeNull()
    expect(s.parseAsk(fx('idle'))).toBeNull()
    expect(s.autoUnavailable(fx('idle'))).toBe(false)
  })
})

// A pretend terminal: pressing keys moves through screens the way agy's would.
function terminal(screens: string[], onKey: (keys: string, i: number) => number) {
  const state = { i: 0, keys: [] as string[] }
  const io: TerminalIO = {
    screen: () => screens[state.i]!,
    write: (k) => {
      state.keys.push(k)
      state.i = onKey(k, state.i)
    },
    sleep: async () => {}
  }
  return { io, state }
}

const detect = (screen: string) => {
  const m = s.genericMenu(screen)
  return m ? { highlighted: m.highlighted } : null
}

describe('driving the menus by keys', () => {
  it('chooses the first permission option with Enter, and the last by moving down first', async () => {
    const yes = terminal([fx('permission'), fx('idle')], (k, i) => (k === '\r' ? 1 : i))
    expect(await s.answerMenu(yes.io, detect, 0)).toBe(true)
    expect(yes.state.keys).toEqual(['\r'])
  })
  it('says yes to a trust question with Enter on the first answer, and no by moving down', async () => {
    const yes = terminal([fx('trust'), fx('idle')], (k, i) => (k === '\r' ? 1 : i))
    expect(await s.answerTrust(yes.io, true)).toBe(true)
    expect(yes.state.keys).toEqual(['\r'])
  })
  it('switches mode with Shift+Tab until the footer shows it', async () => {
    const t = terminal([fx('idle'), fx('mode-accept'), fx('mode-plan')], (k, i) => (k === '\x1b[Z' ? i + 1 : i))
    expect(await s.setMode(t.io, 'plan')).toBe(true)
    expect(t.state.keys).toEqual(['\x1b[Z', '\x1b[Z'])
  })
  it('gives up when the footer never shows the wanted mode', async () => {
    const t = terminal([fx('idle')], (_k, i) => i)
    expect(await s.setMode(t.io, 'plan')).toBe(false)
  })
})
