import { describe, expect, it } from 'vitest'
import { browserCalls, describeCall, isBrowserCommand, refNames } from './browserSteps'

const TOOL = 'npx -y agent-browser@0.41.2'
const say = (command: string, refs: Record<string, string> = {}) => browserCalls(command).map((c) => describeCall(c, refs))

describe('which commands are the agent’s browser', () => {
  it.each([`${TOOL} open http://localhost:5391`, 'agent-browser snapshot -i', `cd /x && ${TOOL} click @e2`, `B="${TOOL}"; $B fill @e9 demo`, `${TOOL} --session s1 get url`])('knows %s', (c) => expect(isBrowserCommand(c)).toBe(true))
  it.each(['npm i agent-browser', 'ls -la', 'echo agent-browser is great', 'curl http://localhost:5391', `${TOOL} --version`.replace('--version', '')])('does not take %s for it', (c) => expect(isBrowserCommand(c)).toBe(false))
})

describe('reading a command line', () => {
  it('splits a chain, through an alias, and drops the redirects and flags', () => {
    const calls = browserCalls(`B="${TOOL}"; $B fill @e9 demo 2>/dev/null && $B click @e8 2>/dev/null && $B snapshot -i 2>/dev/null; $B get url 2>/dev/null`)
    expect(calls).toEqual([
      { cmd: 'fill', args: ['@e9', 'demo'] },
      { cmd: 'click', args: ['@e8'] },
      { cmd: 'snapshot', args: [] },
      { cmd: 'get', args: ['url'] }
    ])
  })
  it('keeps a quoted argument whole', () => {
    expect(browserCalls(`${TOOL} fill "#who" "Prat Ghodke"`)).toEqual([{ cmd: 'fill', args: ['#who', 'Prat Ghodke'] }])
  })
  it('ignores the options that carry a value', () => {
    expect(browserCalls(`${TOOL} --session s1 --cdp ws://x open https://a.b`)).toEqual([{ cmd: 'open', args: ['https://a.b'] }])
  })
})

describe('a shell function that wraps the tool', () => {
  it('is read like the alias: its calls are the tool’s, whatever the function is called', () => {
    const calls = browserCalls(`B(){ ${TOOL} "$@"; }; B set viewport 390 844 && B screenshot "$PWD/phone.png" && B eval "document.title"`)
    expect(calls).toEqual([
      { cmd: 'set', args: ['viewport', '390', '844'] },
      { cmd: 'screenshot', args: ['$PWD/phone.png'] },
      { cmd: 'eval', args: ['document.title'] }
    ])
    expect(isBrowserCommand(`bb() { ${TOOL} "$@" ; }; bb snapshot`)).toBe(true)
  })
  it('does not take a function that is something else for the tool', () => {
    expect(isBrowserCommand('ll(){ ls -la "$@"; }; ll /tmp')).toBe(false)
  })
  it('names a screenshot by where it is in the agent’s folder, not by the variable that gave the folder', () => {
    expect(say(`${TOOL} screenshot "$PWD/phone.png"`)[0]).toMatchObject({ kind: 'shot', file: 'phone.png' })
    expect(say(`${TOOL} screenshot "\${PWD}/shots/a.png"`)[0]).toMatchObject({ file: 'shots/a.png' })
    expect(say(`${TOOL} screenshot ./b.png`)[0]).toMatchObject({ file: 'b.png' })
    expect(say(`${TOOL} screenshot /abs/c.png`)[0]).toMatchObject({ file: '/abs/c.png' })
  })
})

describe('naming the controls from the page the agent read', () => {
  const snap = `- heading "Sign in" [level=1, ref=e1]\n- textbox "Username" [ref=e9]\n- textbox "Password" [ref=e10]\n- button "Sign in" [expanded=false, ref=e8]\n- link "Orders" [ref=e4]: /orders`
  it('maps each ref to the name on the control', () => {
    expect(refNames(snap)).toEqual({ e1: 'Sign in', e9: 'Username', e10: 'Password', e8: 'Sign in', e4: 'Orders' })
  })
  it('keeps a control with no name as its kind', () => {
    expect(refNames('- button [ref=e3]\n- generic [ref=e1] clickable [onclick]')).toEqual({ e3: 'button', e1: 'generic' })
  })
})

describe('what each command says', () => {
  const refs = { e9: 'Username', e10: 'Password', e8: 'Sign in' }
  it('opens, goes back, reloads', () => {
    expect(say(`${TOOL} open https://example.com/a/b?x=1`)[0]).toMatchObject({ kind: 'go', verb: 'Opened', target: 'example.com/a/b?x=1', link: 'https://example.com/a/b?x=1' })
    expect(say(`${TOOL} back`)[0]).toMatchObject({ kind: 'go', verb: 'Went back' })
    expect(say(`${TOOL} reload`)[0]).toMatchObject({ kind: 'go', verb: 'Reloaded' })
  })
  it('reads the page', () => {
    expect(say(`${TOOL} snapshot -i`)[0]).toMatchObject({ kind: 'see', verb: 'Read the page' })
    expect(say(`${TOOL} get text "#hello"`)[0]).toMatchObject({ kind: 'see', verb: 'Read', target: '#hello' })
    expect(say(`${TOOL} get url`)[0]).toMatchObject({ kind: 'see', verb: 'Read the address' })
  })
  it('clicks, naming the control', () => {
    expect(say(`${TOOL} click @e8`, refs)[0]).toMatchObject({ kind: 'act', verb: 'Clicked', target: '“Sign in”' })
    expect(say(`${TOOL} click "#go"`)[0]).toMatchObject({ verb: 'Clicked', target: '#go' })
    expect(say(`${TOOL} dblclick @e8`, refs)[0]).toMatchObject({ verb: 'Double-clicked' })
    expect(say(`${TOOL} hover @e8`, refs)[0]).toMatchObject({ verb: 'Hovered over' })
  })
  it('types, and never shows a password', () => {
    expect(say(`${TOOL} fill @e9 demo`, refs)[0]).toMatchObject({ kind: 'act', verb: 'Typed', target: '“demo”', detail: 'in Username' })
    expect(say(`${TOOL} fill @e10 hunter2`, refs)[0]).toMatchObject({ verb: 'Typed', target: '••••••', detail: 'in Password' })
    // a field that looks like a password by its selector is hidden as well; any other field shows what was typed
    expect(say(`${TOOL} fill "#pass" secret`)[0]?.target).toBe('••••••')
    expect(say(`${TOOL} fill "#who" Prat`)[0]?.target).toBe('“Prat”')
    expect(say(`${TOOL} press Enter`)[0]).toMatchObject({ verb: 'Pressed', target: 'Enter' })
  })
  it('chooses and ticks', () => {
    expect(say(`${TOOL} select @e5 Large`, { e5: 'Size' })[0]).toMatchObject({ verb: 'Chose', target: '“Large”', detail: 'in Size' })
    expect(say(`${TOOL} check @e6`, { e6: 'Remember me' })[0]).toMatchObject({ verb: 'Ticked', target: '“Remember me”' })
  })
  it('scrolls', () => {
    expect(say(`${TOOL} scroll down 500`)[0]).toMatchObject({ kind: 'act', verb: 'Scrolled down' })
    expect(say(`${TOOL} scrollintoview @e8`, refs)[0]).toMatchObject({ verb: 'Scrolled to', target: '“Sign in”' })
  })
  it('resizes, by size or by device, and says what kind of screen it is', () => {
    expect(say(`${TOOL} set viewport 390 844`)[0]).toMatchObject({ kind: 'size', verb: 'Resized to', target: '390 × 844', detail: 'phone' })
    expect(say(`${TOOL} set viewport 820 1180`)[0]?.detail).toBe('tablet')
    expect(say(`${TOOL} set viewport 1440 900`)[0]?.detail).toBe('desktop')
    expect(say(`${TOOL} set device "iPhone 14"`)[0]).toMatchObject({ kind: 'size', verb: 'Resized to', target: 'iPhone 14' })
  })
  it('takes a screenshot, and says where it went', () => {
    expect(say(`${TOOL} screenshot /tmp/x/orders.png`)[0]).toMatchObject({ kind: 'shot', verb: 'Took a screenshot', file: '/tmp/x/orders.png' })
    expect(say(`${TOOL} screenshot`)[0]).toMatchObject({ kind: 'shot', verb: 'Took a screenshot' })
  })
  it('runs a script, waits, looks at tabs', () => {
    expect(say(`${TOOL} eval "document.title"`)[0]).toMatchObject({ kind: 'see', verb: 'Ran a script in the page' })
    expect(say(`${TOOL} wait --text "Done"`)[0]).toMatchObject({ kind: 'wait', verb: 'Waited for', target: '“Done”' })
    expect(say(`${TOOL} wait 2000`)[0]).toMatchObject({ kind: 'wait', verb: 'Waited', target: '2 s' })
    expect(say(`${TOOL} tab`)[0]).toMatchObject({ verb: 'Looked at the tab' })
  })
  it('names what it cannot do, as not allowed', () => {
    expect(say(`${TOOL} upload "#file" /tmp/a.txt`)[0]).toMatchObject({ kind: 'err', verb: 'Tried to upload a file', detail: 'not allowed here' })
  })
  it('never prints a cookie’s value', () => {
    const l = say(`${TOOL} cookies`)[0]
    expect(l).toMatchObject({ kind: 'see', verb: 'Read the cookies' })
    expect(JSON.stringify(l)).not.toMatch(/sid=|value/)
  })
  it('says what a command it does not know is, plainly', () => {
    expect(say(`${TOOL} frobnicate @e1`)[0]).toMatchObject({ kind: 'see', verb: 'Ran agent-browser frobnicate' })
  })
  it('counts the controls it found when it read the page', () => {
    const l = describeCall({ cmd: 'snapshot', args: [] }, {}, '- a [ref=e1]\n- b [ref=e2]\n- c [ref=e3]')
    expect(l.detail).toBe('3 controls')
  })
})
