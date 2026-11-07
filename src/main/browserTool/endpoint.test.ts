import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserEnv, startEndpoint, type Deps, type Endpoint, type Guest } from './endpoint'

/** A page whose debugger answers from a table and records what it was sent. */
function fakeGuest(url = 'http://localhost:5391/') {
  const dbg = new EventEmitter()
  let attached = false
  const sent: [string, unknown][] = []
  const answers: Record<string, unknown> = { 'Runtime.evaluate': { result: { type: 'string', value: 'Site-A' } } }
  const g = {
    url,
    sent,
    typed: [] as unknown[],
    answers,
    dbg,
    /** Electron throws "Object has been destroyed" for anything but isDestroyed() once a page is gone. */
    destroyed: false,
    isDestroyed: () => g.destroyed,
    getURL: () => g.url,
    insertText: async (t: string) => void g.typed.push({ insertText: t }),
    sendInputEvent: (e: unknown) => void g.typed.push({ input: e }),
    get debugger() {
      if (g.destroyed) throw new TypeError('Object has been destroyed')
      return dbgApi
    }
  }
  const dbgApi = {
      isAttached: () => attached,
      attach: () => void (attached = true),
      detach: () => void (attached = false),
      sendCommand: async (m: string, p?: unknown) => {
        sent.push([m, p])
        if (answers[m] instanceof Error) throw answers[m]
        return answers[m] ?? {}
      },
      on: (e: string, cb: (...a: unknown[]) => void) => dbg.on(e, cb),
      removeListener: (e: string, cb: (...a: unknown[]) => void) => dbg.removeListener(e, cb)
  }
  return g
}

type Client = { call: (method: string, params?: object, sessionId?: string) => Promise<any>; events: any[]; ws: WebSocket; closed: Promise<void> }
async function connect(url: string, headers: Record<string, string> = {}): Promise<Client> {
  const ws = new WebSocket(url, { headers })
  let n = 0
  const pend = new Map<number, (m: any) => void>()
  const events: any[] = []
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw))
    if (m.id && pend.has(m.id)) pend.get(m.id)!(m)
    else events.push(m)
  })
  const closed = new Promise<void>((r) => ws.on('close', () => r()))
  await new Promise<void>((res, rej) => (ws.on('open', res), ws.on('error', rej), ws.on('unexpected-response', (_q, r) => rej(new Error('HTTP ' + r.statusCode)))))
  const call = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((res, rej) => {
      const id = ++n
      pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  return { call, events, ws, closed }
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 10))
}

describe('the endpoint a tool connects to', () => {
  let ep: Endpoint
  let guest: ReturnType<typeof fakeGuest> | undefined
  let on = true
  const activity = vi.fn()
  const mayOpen = vi.fn(async (_a: string, _u: string): Promise<string | null> => null)
  const openPage = vi.fn(async (_a: string, _u: string): Promise<Guest | undefined> => undefined)
  const deps: Deps = { guestOf: (a) => (a === 'a1' ? (guest as unknown as Guest) : undefined), mayOpen, openPage, enabled: () => on, activity }
  const wsUrl = (agent = 'a1') => ep.urlFor(agent)
  const httpBase = (agent = 'a1') => wsUrl(agent).replace('ws://', 'http://').replace(/devtools\/browser$/, '')

  beforeEach(async () => {
    guest = fakeGuest()
    on = true
    vi.clearAllMocks()
    ep = await startEndpoint(deps)
  })
  afterEach(async () => ep.close())

  describe('finding it', () => {
    it('gives each agent its own secret address on this computer', () => {
      expect(wsUrl('a1')).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/devtools\/browser$/)
      expect(wsUrl('a1')).toBe(wsUrl('a1'))
      expect(wsUrl('a2')).not.toBe(wsUrl('a1'))
    })

    it('lists only that agent’s page, as a plain page, with no link to the real debugger', async () => {
      const list = (await (await fetch(httpBase() + 'json/list')).json()) as any[]
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ type: 'page', url: guest!.url })
      expect(list[0].webSocketDebuggerUrl).toBe(wsUrl('a1'))
      expect(JSON.stringify(list)).not.toMatch(/devtoolsFrontendUrl/)
      expect((await (await fetch(httpBase() + 'json/version/')).json()).webSocketDebuggerUrl).toBe(wsUrl('a1'))
    })

    it('shows an agent with no page an empty list', async () => {
      expect(await (await fetch(httpBase('a2') + 'json/list')).json()).toEqual([])
    })

    it('does not exist at any other address, nor for a browser page (it has an Origin), nor when switched off', async () => {
      expect((await fetch(httpBase().replace(/[0-9a-f]{32}/, 'f'.repeat(32)) + 'json/list')).status).toBe(404)
      expect((await fetch(httpBase() + 'json/list', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
      await expect(connect(wsUrl(), { Origin: 'https://evil.example' })).rejects.toThrow()
      on = false
      expect((await fetch(httpBase() + 'json/list')).status).toBe(403)
      await expect(connect(wsUrl())).rejects.toThrow()
    })
  })

  describe('the browser part, answered here', () => {
    it('says what it is, and lists one page', async () => {
      const c = await connect(wsUrl())
      expect((await c.call('Browser.getVersion')).product).toBe('AgentWorld/Preview')
      const { targetInfos } = await c.call('Target.getTargets')
      expect(targetInfos).toHaveLength(1)
      expect(targetInfos[0]).toMatchObject({ type: 'page', url: guest!.url, attached: false })
    })

    it('lists nothing for an agent with no page', async () => {
      const c = await connect(wsUrl('a2'))
      expect((await c.call('Target.getTargets')).targetInfos).toEqual([])
    })

    it('attaches the tool to the page, by auto-attach or by asking, and never to another target', async () => {
      const c = await connect(wsUrl())
      await c.call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
      await until(() => c.events.some((e) => e.method === 'Target.attachedToTarget'))
      const att = c.events.find((e) => e.method === 'Target.attachedToTarget')
      expect(att.params.targetInfo.type).toBe('page')
      expect(att.params.waitingForDebugger).toBe(false)
      const { targetInfos } = await c.call('Target.getTargets')
      const { sessionId } = await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
      expect(sessionId).toBeTruthy()
      await expect(c.call('Target.attachToTarget', { targetId: 'the-app-window', flatten: true })).rejects.toThrow(/not available|not your/i)
    })

    it.each(['Browser.close', 'Target.closeTarget', 'Target.createBrowserContext', 'Browser.grantPermissions', 'SystemInfo.getInfo'])('refuses %s', async (m) => {
      const c = await connect(wsUrl())
      await expect(c.call(m, { targetId: 'x' })).rejects.toThrow(/not available|not allowed/i)
    })

    it('answers the download setting without passing it on', async () => {
      const c = await connect(wsUrl())
      expect(await c.call('Browser.setDownloadBehavior', { behavior: 'allow' })).toEqual({})
      expect(guest!.sent).toEqual([])
    })
  })

  describe('the page part, sent on to the page', () => {
    async function session(c: Client) {
      const { targetInfos } = await c.call('Target.getTargets')
      return (await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })).sessionId as string
    }

    it('passes a command to the page’s debugger and returns its answer', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      expect(await c.call('Runtime.evaluate', { expression: 'document.title' }, s)).toEqual({ result: { type: 'string', value: 'Site-A' } })
      expect(guest!.sent).toEqual([['Runtime.evaluate', { expression: 'document.title' }]])
      expect(guest!.debugger.isAttached()).toBe(true)
    })

    it('returns the page’s error as an error', async () => {
      guest!.answers['DOM.getDocument'] = new Error('Cannot find context')
      const c = await connect(wsUrl())
      const s = await session(c)
      await expect(c.call('DOM.getDocument', {}, s)).rejects.toThrow('Cannot find context')
    })

    it('passes the page’s events to the tool, with the session', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      guest!.dbg.emit('message', {}, 'Page.loadEventFired', { timestamp: 1 })
      await until(() => c.events.some((e) => e.method === 'Page.loadEventFired'))
      expect(c.events.find((e) => e.method === 'Page.loadEventFired')).toMatchObject({ params: { timestamp: 1 }, sessionId: s })
    })

    it('refuses what the policy refuses, and does not send it on', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      await expect(c.call('DOM.setFileInputFiles', { files: ['/etc/hosts'] }, s)).rejects.toThrow(/uploads/)
      await expect(c.call('Network.getAllCookies', {}, s)).rejects.toThrow(/cookies/)
      expect(guest!.sent).toEqual([])
    })

    it('types on the page itself, not through the debugger', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      await c.call('Input.insertText', { text: 'Prat' }, s)
      await c.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' }, s)
      expect(guest!.typed).toEqual([{ insertText: 'Prat' }, { input: { type: 'keyDown', keyCode: 'Return', modifiers: [] } }])
      // the only thing that reaches the debugger is the read-only look at which field has the focus: never the text, never a key
      await until(() => guest!.sent.length >= 1)
      expect(guest!.sent.every(([m]) => m === 'Runtime.evaluate')).toBe(true)
      expect(JSON.stringify(guest!.sent)).not.toContain('Prat')
    })

    it('goes to an address only when it is allowed, and says why when it is not', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      await c.call('Page.navigate', { url: 'http://localhost:5392/' }, s)
      expect(mayOpen).toHaveBeenCalledWith('a1', 'http://localhost:5392/')
      expect(guest!.sent).toEqual([['Page.navigate', { url: 'http://localhost:5392/' }]])
      mayOpen.mockResolvedValueOnce('example.com is not allowed in the Preview yet')
      await expect(c.call('Page.navigate', { url: 'https://example.com/' }, s)).rejects.toThrow('example.com is not allowed in the Preview yet')
      expect(guest!.sent).toHaveLength(1)
    })

    it('never sends the tool an address that is not a web page', async () => {
      const c = await connect(wsUrl())
      const s = await session(c)
      for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://gpu', 'data:text/html,hi']) await expect(c.call('Page.navigate', { url }, s)).rejects.toThrow(/web page|address/i)
      expect(mayOpen).not.toHaveBeenCalled()
      expect(guest!.sent).toEqual([])
    })

    it('opens the Preview’s page when the agent has none, at an allowed address', async () => {
      const g2 = fakeGuest('http://localhost:5392/')
      openPage.mockResolvedValueOnce(g2 as unknown as Guest)
      const c = await connect(wsUrl('a2'))
      const r = await c.call('Target.createTarget', { url: 'http://localhost:5392/' })
      expect(openPage).toHaveBeenCalledWith('a2', 'http://localhost:5392/')
      expect(r.targetId).toBeTruthy()
    })

    it('opens a blank page when the tool asks for a blank tab, which is what most tools ask for first, and asks no one', async () => {
      const g2 = fakeGuest('about:blank')
      openPage.mockResolvedValue(g2 as unknown as Guest)
      for (const url of ['about:blank', '']) {
        const c = await connect(wsUrl('a2'))
        expect((await c.call('Target.createTarget', { url })).targetId).toBeTruthy()
      }
      expect(openPage).toHaveBeenCalledWith('a2', 'about:blank')
      expect(mayOpen).not.toHaveBeenCalled()
    })

    it('does not open a page at an address that is not a web page', async () => {
      const c = await connect(wsUrl('a2'))
      for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://gpu']) await expect(c.call('Target.createTarget', { url })).rejects.toThrow(/http or https/i)
      expect(openPage).not.toHaveBeenCalled()
    })

    it('refuses to open a second page for an agent that has one, and one at an address not allowed', async () => {
      const c = await connect(wsUrl())
      await expect(c.call('Target.createTarget', { url: 'http://localhost:5392/' })).rejects.toThrow(/one page|Page.navigate/i)
      mayOpen.mockResolvedValueOnce('nope')
      const c2 = await connect(wsUrl('a2'))
      await expect(c2.call('Target.createTarget', { url: 'https://example.com/' })).rejects.toThrow('nope')
      expect(openPage).not.toHaveBeenCalled()
    })
  })

  describe('coming and going', () => {
    it('lets go of the page’s debugger when the last tool leaves, and reports who is connected', async () => {
      const a = await connect(wsUrl())
      const b = await connect(wsUrl())
      const { targetInfos } = await a.call('Target.getTargets')
      await a.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
      await b.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
      expect(guest!.debugger.isAttached()).toBe(true)
      expect(activity).toHaveBeenLastCalledWith('a1', expect.objectContaining({ connections: 2 }))
      a.ws.close()
      await a.closed
      await until(() => activity.mock.lastCall?.[1].connections === 1)
      expect(guest!.debugger.isAttached()).toBe(true)
      b.ws.close()
      await b.closed
      await until(() => !guest!.debugger.isAttached())
      expect(guest!.debugger.isAttached()).toBe(false)
      expect(activity).toHaveBeenLastCalledWith('a1', expect.objectContaining({ connections: 0 }))
    })

    describe('what the agent is doing, in words', () => {
      async function onPage() {
        const c = await connect(wsUrl())
        const { targetInfos } = await c.call('Target.getTargets')
        const { sessionId } = await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
        activity.mockClear()
        return { c, s: sessionId as string }
      }
      const last = () => activity.mock.lastCall?.[1]

      it('says an address being opened', async () => {
        const { c, s } = await onPage()
        await c.call('Page.navigate', { url: 'http://localhost:5392/orders' }, s)
        expect(last()).toMatchObject({ method: 'Page.navigate', action: { pill: 'OPENING', target: 'localhost:5392/orders' } })
      })

      it('names the control that was clicked by asking the page what is under the pointer, read-only', async () => {
        guest!.answers['Runtime.evaluate'] = { result: { type: 'string', value: 'Sign in' } }
        const { c, s } = await onPage()
        await c.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 48, button: 'left', clickCount: 1 }, s)
        await until(() => last()?.action?.target !== undefined)
        expect(last()).toMatchObject({ action: { pill: 'CLICKING', target: '“Sign in”' } })
        const asked = guest!.sent.find(([m, p]) => m === 'Runtime.evaluate' && String((p as { expression: string }).expression).includes('elementFromPoint'))!
        expect((asked[1] as { expression: string }).expression).toContain('elementFromPoint(120, 48)')
        expect((asked[1] as { expression: string }).expression).not.toMatch(/\.value\s*=|click\(|focus\(|dispatchEvent|innerHTML\s*=/)
      })

      it('names the field being typed in, and never the text', async () => {
        guest!.answers['Runtime.evaluate'] = { result: { type: 'string', value: 'Password' } }
        const { c, s } = await onPage()
        await c.call('Input.insertText', { text: 'hunter2' }, s)
        await until(() => last()?.action?.target !== undefined)
        expect(last()).toMatchObject({ action: { pill: 'TYPING', target: 'Password' } })
        expect(JSON.stringify(activity.mock.calls)).not.toContain('hunter2')
      })

      it('says what it can when the page is slow to answer, instead of waiting', async () => {
        guest!.debugger.sendCommand = () => new Promise(() => {})
        const { c, s } = await onPage()
        void c.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left', clickCount: 1 }, s).catch(() => {})
        await until(() => last()?.action?.pill === 'CLICKING')
        expect(last()?.action).toEqual({ pill: 'CLICKING' })
      })

      it('does not let a small script replace the label of what was just done', async () => {
        const { c, s } = await onPage()
        await c.call('Page.captureScreenshot', {}, s).catch(() => {})
        await c.call('Runtime.evaluate', { expression: '1' }, s)
        expect(activity.mock.calls.some(([, a]) => a.action?.pill === 'SCRIPT')).toBe(false)
        expect(activity.mock.calls.some(([, a]) => a.action?.pill === 'SCREENSHOT')).toBe(true)
      })

      it('reports the size the agent set, and that it put it back', async () => {
        const { c, s } = await onPage()
        await c.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, s)
        // never sent to the page: laid out at a size it does not have, it draws tiled; the Preview's own frame takes the size instead
        expect(guest!.sent.some(([m]) => m === 'Emulation.setDeviceMetricsOverride')).toBe(false)
        expect(last()).toMatchObject({ action: { pill: 'RESIZING', target: '390 × 844 · phone' }, size: { w: 390, h: 844, label: 'phone' } })
        await c.call('Emulation.clearDeviceMetricsOverride', {}, s)
        expect(last()).toMatchObject({ size: null })
      })

      it('puts the size back when the tool that set it leaves, even while another tool of the agent stays', async () => {
        const a = await onPage()
        const b = await onPage()
        await a.c.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844 }, a.s)
        expect(last()).toMatchObject({ size: { w: 390, h: 844 } })
        b.c.ws.close()
        await b.c.closed
        await until(() => activity.mock.calls.some(([, x]) => x.connections === 1))
        expect(activity.mock.calls.some(([, x]) => x.size === null)).toBe(false) // the one that set it is still here
        a.c.ws.close()
        await a.c.closed
        await until(() => activity.mock.calls.some(([, x]) => x.size === null))
        expect(activity.mock.calls.at(-1)![1]).toMatchObject({ size: null })
      })

      it('keeps the size when a tool that never set one leaves, and puts it back when the one that did leaves', async () => {
        const a = await onPage()
        const b = await onPage()
        await b.c.call('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180 }, b.s)
        activity.mockClear()
        a.c.ws.close()
        await a.c.closed
        await until(() => activity.mock.calls.length > 0)
        expect(activity.mock.calls.some(([, x]) => x.size === null)).toBe(false)
        b.c.ws.close()
        await b.c.closed
        await until(() => activity.mock.calls.some(([, x]) => x.size === null))
        expect(activity.mock.calls.some(([, x]) => x.size === null)).toBe(true)
      })

      it('says a refusal as a refusal', async () => {
        const { c, s } = await onPage()
        await expect(c.call('DOM.setFileInputFiles', { files: ['/etc/hosts'] }, s)).rejects.toThrow()
        expect(last()).toMatchObject({ action: { pill: 'UPLOAD FILE', refused: true } })
      })
    })

    it('says which command ran last', async () => {
      const c = await connect(wsUrl())
      const { targetInfos } = await c.call('Target.getTargets')
      const { sessionId } = await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
      await c.call('Runtime.evaluate', { expression: '1' }, sessionId)
      expect(activity).toHaveBeenLastCalledWith('a1', expect.objectContaining({ connections: 1, method: 'Runtime.evaluate' }))
    })

    it('cuts one agent’s tools off when told to', async () => {
      const c = await connect(wsUrl())
      ep.disconnect('a1')
      await c.closed
      expect(c.ws.readyState).toBe(WebSocket.CLOSED)
    })

    it('hands a tool the page that replaces one that went, when it is listening for pages', async () => {
      const c = await connect(wsUrl())
      await c.call('Target.setDiscoverTargets', { discover: true })
      await c.call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
      await until(() => c.events.some((e) => e.method === 'Target.attachedToTarget'))
      const first = c.events.find((e) => e.method === 'Target.attachedToTarget').params.sessionId
      ep.pageGone('a1')
      c.events.length = 0
      guest = fakeGuest('http://localhost:5392/')
      ep.pageReady('a1')
      await until(() => c.events.some((e) => e.method === 'Target.attachedToTarget'))
      expect(c.events.some((e) => e.method === 'Target.targetCreated' && e.params.targetInfo.url === 'http://localhost:5392/')).toBe(true)
      const next = c.events.find((e) => e.method === 'Target.attachedToTarget')
      expect(next.params.sessionId).not.toBe(first)
      expect(next.params.targetInfo.url).toBe('http://localhost:5392/')
      // and it works on the new page
      expect(await c.call('Runtime.evaluate', { expression: '1' }, next.params.sessionId)).toBeTruthy()
      expect(guest!.sent).toEqual([['Runtime.evaluate', { expression: '1' }]])
    })

    it('does not attach a tool that did not ask to be attached to every page', async () => {
      const c = await connect(wsUrl())
      ep.pageReady('a1')
      await new Promise((r) => setTimeout(r, 50))
      expect(c.events.some((e) => e.method === 'Target.attachedToTarget')).toBe(false)
    })

    describe('a page that is destroyed under a connected tool', () => {
      // An error thrown in the main process shows a modal dialog and stops the app until it is dismissed: nothing here may throw.
      const uncaught: unknown[] = []
      const catcher = (e: unknown) => void uncaught.push(e)
      beforeEach(() => (uncaught.length = 0, process.on('uncaughtException', catcher)))
      afterEach(() => void process.off('uncaughtException', catcher))

      async function attached() {
        const c = await connect(wsUrl())
        const { targetInfos } = await c.call('Target.getTargets')
        await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
        return c
      }

      it('is told to the tool without touching the dead page', async () => {
        const c = await attached()
        guest!.destroyed = true
        expect(() => ep.pageGone('a1')).not.toThrow()
        await until(() => c.events.some((e) => e.method === 'Target.detachedFromTarget'))
        expect(c.events.some((e) => e.method === 'Target.detachedFromTarget')).toBe(true)
      })

      it('lets the tool disconnect afterwards without an error', async () => {
        const c = await attached()
        guest!.destroyed = true
        c.ws.close()
        await c.closed
        await new Promise((r) => setTimeout(r, 50))
        expect(uncaught).toEqual([])
      })

      it('lets the tool disconnect after the page went and the tool was told', async () => {
        const c = await attached()
        guest!.destroyed = true
        ep.pageGone('a1')
        c.ws.close()
        await c.closed
        await new Promise((r) => setTimeout(r, 50))
        expect(uncaught).toEqual([])
      })

      it('keeps serving: a new page for the same agent is attached by a tool that comes after', async () => {
        const c = await attached()
        guest!.destroyed = true
        ep.pageGone('a1')
        c.ws.close()
        await c.closed
        guest = fakeGuest('http://localhost:5393/')
        const c2 = await connect(wsUrl())
        const { targetInfos } = await c2.call('Target.getTargets')
        expect(targetInfos[0].url).toBe('http://localhost:5393/')
      })

      it('does not let an error in a connection’s callbacks out of the endpoint', async () => {
        const c = await attached()
        guest!.dbg.emit('message', {}, 'Page.loadEventFired', { timestamp: 1 })
        c.ws.terminate()
        await c.closed
        guest!.dbg.emit('message', {}, 'Page.loadEventFired', { timestamp: 2 })
        await new Promise((r) => setTimeout(r, 50))
        expect(uncaught).toEqual([])
      })
    })

    it('tells the tool when the page goes away', async () => {
      const c = await connect(wsUrl())
      const { targetInfos } = await c.call('Target.getTargets')
      await c.call('Target.setDiscoverTargets', { discover: true })
      const { sessionId } = await c.call('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true })
      ep.pageGone('a1')
      await until(() => c.events.some((e) => e.method === 'Target.detachedFromTarget'))
      expect(c.events.find((e) => e.method === 'Target.detachedFromTarget').params.sessionId).toBe(sessionId)
      expect(c.events.some((e) => e.method === 'Target.targetDestroyed')).toBe(true)
    })
  })
})

describe('what an agent is given to reach its browser', () => {
  it('is its own address under the names both tools read, and a session of its own so two agents never share the tool’s background process', () => {
    const url = 'ws://127.0.0.1:5000/abc/devtools/browser'
    expect(browserEnv(url, 'a1')).toEqual({ AW_BROWSER_CDP: url, AGENT_BROWSER_CDP: url, AGENT_BROWSER_SESSION: 'aw-a1' })
    expect(browserEnv(url, 'a2').AGENT_BROWSER_SESSION).not.toBe(browserEnv(url, 'a1').AGENT_BROWSER_SESSION)
  })
})
