import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { isWebUrl } from '../../renderer/links'
import { decide, type TypeStep } from './policy'
import { actionOf, type Action, type Said } from './words'

/** The part of an Electron page (`webContents`) the endpoint uses. */
export interface Guest {
  isDestroyed(): boolean
  getURL(): string
  getTitle?(): string
  insertText(text: string): Promise<void>
  sendInputEvent(e: { type: string; keyCode: string; modifiers: string[] }): void
  debugger: {
    isAttached(): boolean
    attach(version?: string): void
    detach(): void
    sendCommand(method: string, params?: object): Promise<unknown>
    on(event: 'message', cb: (e: unknown, method: string, params: unknown) => void): unknown
    removeListener(event: 'message', cb: (e: unknown, method: string, params: unknown) => void): unknown
  }
}

export interface Deps {
  /** The Preview page of this agent, if it has one. */
  guestOf(agentId: string): Guest | undefined
  /** The tool wants to go to `url`: null when it may, otherwise why not. May wait for the person to answer. */
  mayOpen(agentId: string, url: string): Promise<string | null>
  /** The agent has no page: have the Preview make one at `url`. */
  openPage(agentId: string, url: string): Promise<Guest | undefined>
  enabled(): boolean
  /** Who is connected and what ran last, for the marker on the page. */
  activity(agentId: string, a: { connections: number; method?: string; action?: Action; size?: { w: number; h: number; label: string } | null }): void
}

export interface Endpoint {
  port: number
  /** The address an agent's tools connect to: secret, new at each start, and good for that agent's page only. */
  urlFor(agentId: string): string
  /** Cut one agent's tools off (or every agent's). A tool may connect again by itself, on its next command. */
  disconnect(agentId?: string): void
  /** The agent's page was closed: tell its tools. */
  pageGone(agentId: string): void
  /** The agent has a page (a new one, or one that replaced a closed page): tools that listen for pages are told, and those that asked to be attached to every page are. */
  pageReady(agentId: string): void
  close(): Promise<void>
}

interface Conn {
  ws: WebSocket
  agentId: string
  session?: string
  guest?: Guest
  autoAttach?: boolean
  discover?: boolean
  listener?: (e: unknown, method: string, params: unknown) => void
}

/**
 * What an agent is given to reach its browser. Both tools read it: AW_BROWSER_CDP for Playwright, AGENT_BROWSER_CDP for agent-browser, and with it a session of the agent's own,
 * so two agents never share the tool's one background process (which would be bound to one page at a time).
 */
export const browserEnv = (url: string, agentId: string) => ({ AW_BROWSER_CDP: url, AGENT_BROWSER_CDP: url, AGENT_BROWSER_SESSION: `aw-${agentId}` })

/** What the page itself calls the control under the pointer, or the field being typed in: a short, read-only look (it changes nothing in the page). */
const POINT = (x: number, y: number) =>
  `(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return ''; const c = e.closest('button,a,[role=button],[role=link],input,select,textarea,label,summary') || e; const t = c.getAttribute('aria-label') || (c.tagName === 'INPUT' ? (/^(submit|button|reset)$/.test(c.type) ? c.value : c.placeholder || c.name || c.id || c.type) : c.innerText) || c.title || c.alt || c.name || c.id || c.tagName.toLowerCase(); return String(t).trim().replace(/\\s+/g, ' ').slice(0, 40) })()`
const FOCUS = `(() => { const e = document.activeElement; if (!e || e === document.body) return ''; const l = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].innerText) || e.placeholder || e.name || e.id || e.tagName.toLowerCase(); return String(l).trim().replace(/\\s+/g, ' ').slice(0, 40) })()`
const LOOKUP_MS = 250

async function lookupName(g: Guest, l: NonNullable<Said['lookup']>): Promise<string | undefined> {
  const at = 'at' in l ? l.at.map((n) => Math.round(Number.isFinite(n) ? n : 0)) : null
  const ask = g.debugger.sendCommand('Runtime.evaluate', { expression: at ? POINT(at[0]!, at[1]!) : FOCUS, returnByValue: true })
  const r = (await Promise.race([ask, new Promise((res) => setTimeout(() => res(undefined), LOOKUP_MS))])) as { result?: { value?: unknown } } | undefined
  const v = r?.result?.value
  return typeof v === 'string' && v ? (at ? `“${v}”` : v) : undefined
}

/** An error in one of these callbacks would reach the main process as an uncaught exception: a modal error dialog that stops the app until it is dismissed. It stays here. */
const safe =
  <A extends unknown[]>(f: (...a: A) => void) =>
  (...a: A) => {
    try {
      f(...a)
    } catch (e) {
      console.error('browser tool:', e)
    }
  }

const refuse = (what: string) => `${what} is not available to a browser tool here`
const BROWSER_CONTEXT = 'agent-world-preview'

/**
 * A browser debugging endpoint for tools (agent-browser, Playwright) on an agent's own Preview page and nothing else. It answers the browser part itself
 * (one page, always attached, never paused) and passes the page part on, through the policy, to the page's debugger. No port of the app's own is opened.
 */
export async function startEndpoint(deps: Deps): Promise<Endpoint> {
  const tokens = new Map<string, string>() // agent -> secret
  const agents = new Map<string, string>() // secret -> agent
  const conns = new Map<string, Set<Conn>>()
  const ours = new WeakSet<Guest>() // pages whose debugger we attached
  const tokenFor = (agentId: string) => {
    let t = tokens.get(agentId)
    if (!t) (t = randomBytes(16).toString('hex'), tokens.set(agentId, t), agents.set(t, agentId))
    return t
  }
  const set = (agentId: string) => conns.get(agentId) ?? conns.set(agentId, new Set()).get(agentId)!
  const targetId = (agentId: string) => `page-${agentId}`
  const info = (c: Conn, g: Guest) => ({ targetId: targetId(c.agentId), type: 'page', title: g.getTitle?.() ?? '', url: g.getURL(), attached: !!c.session, canAccessOpener: false, browserContextId: BROWSER_CONTEXT })
  const live = (agentId: string) => [...set(agentId)].filter((c) => c.session).length
  const lastSaid = new Map<string, number>()
  // Which connection set the page's size: it ends when that one leaves, whatever other tools of the agent stay.
  const sizeOwner = new Map<string, Conn>()
  /** A command arrives: the tab says what it is, with the name of what it is done to when the page can tell (a moment later, never holding the command up). */
  function announce(c: Conn, g: Guest, method: string, params: Record<string, any>) {
    const said = actionOf(method, params)
    if (!said || (said.action.low && Date.now() - (lastSaid.get(c.agentId) ?? 0) < 800)) return report(c.agentId, method)
    lastSaid.set(c.agentId, Date.now())
    if (said.size !== undefined) said.size === null ? sizeOwner.delete(c.agentId) : sizeOwner.set(c.agentId, c)
    const send = (target?: string) => deps.activity(c.agentId, { connections: set(c.agentId).size, method, action: target ? { ...said.action, target } : said.action, ...(said.size !== undefined && { size: said.size }) })
    if (!said.lookup) return send()
    void lookupName(g, said.lookup).then(send, () => send())
  }
  const report = (agentId: string, method?: string) => deps.activity(agentId, { connections: set(agentId).size, ...(method ? { method } : {}) })

  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  const wsUrl = (agentId: string) => `ws://127.0.0.1:${port}/${tokenFor(agentId)}/devtools/browser`

  /** Who this request is for, or why it is refused: a page in a browser carries an Origin, and the address must be ours. */
  function who(req: IncomingMessage): { agentId: string; rest: string } | number {
    const host = req.headers.host
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return 403
    if (req.headers.origin !== undefined) return 403
    const m = /^\/([0-9a-f]{32})\/(.*?)\/*$/.exec(req.url ?? '')
    const agentId = m && agents.get(m[1]!)
    if (!agentId) return 404
    return deps.enabled() ? { agentId, rest: m![2]! } : 403
  }

  server.on('request', safe((req: IncomingMessage, res: ServerResponse) => {
    const w = who(req)
    const out = (code: number, body: unknown) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(body)))
    if (typeof w === 'number') return out(w, { error: w === 403 ? 'Not allowed here, or browser tools are switched off in Settings' : 'Not found' })
    const g = deps.guestOf(w.agentId)
    if (w.rest === 'json/version') return out(200, { Browser: 'AgentWorld/Preview', 'Protocol-Version': '1.3', 'User-Agent': 'Agent World Preview', webSocketDebuggerUrl: wsUrl(w.agentId) })
    if (w.rest === 'json/list' || w.rest === 'json') return out(200, g && !g.isDestroyed() ? [{ id: targetId(w.agentId), type: 'page', title: g.getTitle?.() ?? '', url: g.getURL(), webSocketDebuggerUrl: wsUrl(w.agentId) }] : [])
    out(404, { error: 'Not found' })
  }))

  server.on('upgrade', safe((req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const w = who(req)
    if (typeof w === 'number' || w.rest !== 'devtools/browser') return void socket.end(`HTTP/1.1 ${typeof w === 'number' ? w : 404} Refused\r\n\r\n`)
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, w.agentId))
  }))

  function attach(c: Conn): boolean {
    const g = deps.guestOf(c.agentId)
    if (!g || g.isDestroyed()) return false
    if (c.session) return true
    c.session = `S${randomBytes(8).toString('hex')}`
    c.guest = g
    if (!g.debugger.isAttached()) (g.debugger.attach('1.3'), ours.add(g))
    c.listener = safe((_e: unknown, method: string, params: unknown) => send(c, { method, params, sessionId: c.session }))
    g.debugger.on('message', c.listener)
    send(c, { method: 'Target.attachedToTarget', params: { sessionId: c.session, targetInfo: { ...info(c, g), attached: true }, waitingForDebugger: false } })
    report(c.agentId)
    return true
  }

  function release(c: Conn) {
    const g = c.guest
    if (!g || !c.listener) return
    const listener = c.listener
    c.session = c.guest = c.listener = undefined
    // A page that is gone throws at any touch of it ("Object has been destroyed"): there is nothing left to let go of.
    if (g.isDestroyed()) return void ours.delete(g)
    try {
      g.debugger.removeListener('message', listener)
      if (!live(c.agentId) && ours.has(g) && g.debugger.isAttached()) {
        g.debugger.detach()
        ours.delete(g)
      }
    } catch {
      /* the page went while we looked */
    }
  }

  const send = (c: Conn, m: object) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m))

  function join(ws: WebSocket, agentId: string) {
    const c: Conn = { ws, agentId }
    set(agentId).add(c)
    report(agentId)
    ws.on(
      'message',
      safe((raw) => {
        let m: { id: number; method: string; params?: Record<string, any>; sessionId?: string }
        try {
          m = JSON.parse(String(raw))
        } catch {
          return
        }
        void handle(c, m).catch((e) => console.error('browser tool:', e))
      })
    )
    ws.on(
      'close',
      safe(() => {
        release(c)
        set(agentId).delete(c)
        if (sizeOwner.get(agentId) === c) (sizeOwner.delete(agentId), deps.activity(agentId, { connections: set(agentId).size, size: null }))
        else report(agentId)
      })
    )
    ws.on('error', safe((e: Error) => console.error('browser tool:', e.message)))
  }

  async function handle(c: Conn, m: { id: number; method: string; params?: Record<string, any>; sessionId?: string }) {
    const reply = (result: object = {}) => send(c, { id: m.id, sessionId: m.sessionId, result })
    const fail = (message: string) => send(c, { id: m.id, sessionId: m.sessionId, error: { code: -32000, message } })
    const params = m.params ?? {}
    try {
      if (m.sessionId !== undefined) {
        if (m.sessionId !== c.session || !c.guest) return fail('Unknown session')
        const g = c.guest
        if (g.isDestroyed()) return fail('The Preview page is gone')
        if (m.method === 'Target.setAutoAttach') return reply()
        announce(c, g, m.method, params)
        const d = decide(m.method, params, { url: g.getURL() })
        switch (d.do) {
          case 'refuse':
            return fail(d.why)
          case 'reply':
            return reply(d.result)
          case 'forward':
            return reply((await g.debugger.sendCommand(m.method, d.params)) as object)
          case 'navigate': {
            if (!isWebUrl(d.url) && d.url !== 'about:blank') return fail('That is not a web page address: only http and https addresses can be opened')
            const why = d.url === 'about:blank' ? null : await deps.mayOpen(c.agentId, d.url)
            return why ? fail(why) : reply((await g.debugger.sendCommand(m.method, d.params)) as object)
          }
          case 'type':
            for (const s of d.steps as TypeStep[]) 'insertText' in s ? await g.insertText(s.insertText) : g.sendInputEvent(s.input)
            return reply()
        }
      }
      const g = deps.guestOf(c.agentId)
      const here = g && !g.isDestroyed() ? g : undefined
      switch (m.method) {
        case 'Browser.getVersion':
          return reply({ protocolVersion: '1.3', product: 'AgentWorld/Preview', revision: '', userAgent: 'Agent World Preview', jsVersion: '' })
        case 'Browser.getWindowForTarget':
          return reply({ windowId: 1, bounds: {} })
        case 'Browser.setDownloadBehavior':
          return reply()
        case 'Target.getBrowserContexts':
          return reply({ browserContextIds: [] })
        case 'Target.getTargets':
          return reply({ targetInfos: here ? [info(c, here)] : [] })
        case 'Target.getTargetInfo':
          return here ? reply({ targetInfo: info(c, here) }) : fail('No page')
        case 'Target.setDiscoverTargets':
          c.discover = !!params.discover
          reply()
          if (c.discover && here) send(c, { method: 'Target.targetCreated', params: { targetInfo: info(c, here) } })
          return
        case 'Target.setAutoAttach':
          c.autoAttach = !!params.autoAttach
          reply()
          if (c.autoAttach) attach(c)
          return
        case 'Target.attachToTarget': {
          if (!here || params.targetId !== targetId(c.agentId)) return fail(refuse('That page'))
          attach(c)
          return reply({ sessionId: c.session })
        }
        case 'Target.detachFromTarget':
        case 'Target.activateTarget':
          return reply()
        case 'Target.createTarget': {
          if (here) return fail('This agent has one page, its Preview: use Page.navigate to move it')
          // Most tools ask for a blank tab first and then move it: a blank page needs no one's leave.
          const raw = String(params.url ?? '')
          const blank = raw === '' || raw === 'about:blank'
          if (!blank && !isWebUrl(raw)) return fail('Give an http or https address: the Preview opens a page at an address')
          const why = blank ? null : await deps.mayOpen(c.agentId, raw)
          if (why) return fail(why)
          if (!(await deps.openPage(c.agentId, blank ? 'about:blank' : raw))) return fail('The Preview could not open that page. Ask the person to open the Preview tab once')
          reply({ targetId: targetId(c.agentId) })
          if (c.autoAttach) attach(c)
          return
        }
        default:
          return fail(refuse(m.method))
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  return {
    port,
    urlFor: wsUrl,
    disconnect(agentId) {
      // At once, not by asking the tool to close: a tool that is slow to answer must not stay connected for it.
      for (const [a, cs] of conns) if (!agentId || a === agentId) for (const c of cs) c.ws.terminate()
    },
    pageReady(agentId) {
      const g = deps.guestOf(agentId)
      if (!g || g.isDestroyed()) return
      for (const c of set(agentId)) {
        try {
          if (c.discover) send(c, { method: 'Target.targetCreated', params: { targetInfo: info(c, g) } })
          if (c.autoAttach && !c.session) attach(c)
        } catch (e) {
          console.error('browser tool:', e) // one tool's trouble must not stop the others, nor reach the main process
        }
      }
    },
    pageGone(agentId) {
      for (const c of set(agentId)) {
        if (c.session) send(c, { method: 'Target.detachedFromTarget', params: { sessionId: c.session, targetId: targetId(agentId) } })
        if (c.discover) send(c, { method: 'Target.targetDestroyed', params: { targetId: targetId(agentId) } })
        if (c.guest && c.listener && !c.guest.isDestroyed()) {
          try {
            c.guest.debugger.removeListener('message', c.listener)
          } catch {
            /* the page went while we looked */
          }
        }
        c.session = c.guest = c.listener = undefined
      }
    },
    close: () =>
      new Promise<void>((r) => {
        for (const cs of conns.values()) for (const c of cs) c.ws.terminate()
        wss.close()
        server.close(() => r())
        server.closeAllConnections?.()
      })
  }
}
