import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ProbeResult, ProbeTool } from '../../shared/mcp'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const MAX_TOOLS = 300
const MAX_TEXT = 1000

/** A server's own text, as plain text: no control characters, and no more than a screen of it. */
const clean = (v: unknown, max = MAX_TEXT) => {
  const t = (typeof v === 'string' ? v : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function typeOf(p: unknown): string {
  if (!isObj(p)) return 'any'
  if (Array.isArray(p.enum)) return clean(p.enum.map(String).join(' | '), 60)
  if (Array.isArray(p.anyOf)) return clean([...new Set(p.anyOf.map(typeOf))].join(' | '), 60)
  if (p.type === 'array') return `${typeOf(p.items)}[]`
  return clean(Array.isArray(p.type) ? p.type.join(' | ') : typeof p.type === 'string' ? p.type : 'any', 60)
}

function toolOf(t: unknown): ProbeTool | null {
  if (!isObj(t) || typeof t.name !== 'string') return null
  const schema = isObj(t.inputSchema) ? t.inputSchema : {}
  const props = isObj(schema.properties) ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === 'string') : [])
  const a = isObj(t.annotations) ? t.annotations : {}
  return {
    name: clean(t.name, 128),
    description: clean(t.description),
    params: Object.entries(props).slice(0, 40).map(([name, p]) => ({ name: clean(name, 80), type: typeOf(p), required: required.has(name) })),
    ...(a.readOnlyHint === true && { readOnly: true }),
    ...(a.destructiveHint === true && { destructive: true })
  }
}

/** The values in an entry that must not appear in anything the probe says: each variable and header, and the password and query values of an address. */
export function secretsOf(def: Obj): string[] {
  const out: string[] = [...Object.values(isObj(def.env) ? def.env : {}), ...Object.values(isObj(def.headers) ? def.headers : {})].filter((v): v is string => typeof v === 'string')
  if (typeof def.url === 'string') {
    try {
      const u = new URL(def.url)
      out.push(decodeURIComponent(u.password), ...[...u.searchParams.values()])
    } catch {
      /* not an address: the probe says so */
    }
  }
  return out.filter((v) => v.length >= 6)
}

const sleep = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms).unref?.())
const TIMED_OUT = Symbol('timeout')

export interface ProbeOptions {
  timeoutMs: number
  /** The environment a server starts in: what the app starts its agents in (the login shell's PATH, so `npx` is found). */
  baseEnv: Record<string, string | undefined>
  cwd?: string
}

/**
 * Starts a server from its own entry, speaks MCP to it (initialize, then its tools), and ends it. Only called when the person asks. The values in `def` are
 * used here and nowhere else: what comes back holds the server's own words about itself and never an entry's variables.
 */
export async function probe(def: Obj, o: ProbeOptions): Promise<ProbeResult> {
  const t0 = Date.now()
  const done = (r: Omit<ProbeResult, 'ms' | 'at' | 'tools'> & { tools?: ProbeTool[] }): ProbeResult => ({ tools: [], ...r, ms: Date.now() - t0, at: Date.now() })
  const secrets = secretsOf(def)
  const hide = (s: string) => secrets.reduce((m, v) => m.split(v).join('•••'), s)
  let stderr = ''
  let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport
  try {
    if (typeof def.url === 'string') {
      const url = new URL(def.url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return done({ status: 'failed', message: 'The address must start with http:// or https://.' })
      const requestInit = { headers: isObj(def.headers) ? (def.headers as Record<string, string>) : {} }
      transport = def.type === 'sse' ? new SSEClientTransport(url, { requestInit }) : new StreamableHTTPClientTransport(url, { requestInit })
    } else if (typeof def.command === 'string' && def.command) {
      const env: Record<string, string> = { ...(o.baseEnv.PATH ? { PATH: o.baseEnv.PATH } : {}), ...(isObj(def.env) ? (def.env as Record<string, string>) : {}) }
      transport = new StdioClientTransport({ command: def.command, args: Array.isArray(def.args) ? def.args.map(String) : [], env, stderr: 'pipe', ...(o.cwd && { cwd: o.cwd }) })
      transport.stderr?.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-1200)))
    } else return done({ status: 'failed', message: 'The entry has no command or address.' })
  } catch (e) {
    return done({ status: 'failed', message: hide(clean(e instanceof Error ? e.message : String(e), 300)) })
  }
  const client = new Client({ name: 'agent-world', version: '1' }, { capabilities: {} })
  const finish = async () => void (await Promise.race([client.close().catch(() => undefined), transport.close().catch(() => undefined), sleep(2500, undefined)]))
  try {
    const run = (async () => {
      await client.connect(transport)
      const tools: ProbeTool[] = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined)
        for (const t of page.tools) {
          const x = toolOf(t)
          if (x && tools.length < MAX_TOOLS) tools.push(x)
        }
        cursor = page.nextCursor
      } while (cursor && tools.length < MAX_TOOLS)
      const v = client.getServerVersion()
      return done({ status: 'connected', tools, ...(v && { server: { name: clean(v.name, 80), version: clean(v.version, 40) } }) })
    })()
    run.catch(() => undefined)
    const r = await Promise.race([run, sleep(o.timeoutMs, TIMED_OUT)])
    if (r === TIMED_OUT) return done({ status: 'timeout', message: `No answer in ${Math.round(o.timeoutMs / 1000)} s.` })
    return r
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (e instanceof UnauthorizedError || /\b401\b|unauthori[sz]ed/i.test(msg)) return done({ status: 'signin', message: 'The server wants a sign-in.' })
    // A server that stops right away usually says why on its error output; that is a better line than "Connection closed".
    const last = stderr.split('\n').map((l) => l.trim()).filter(Boolean).at(-1)
    return done({ status: 'failed', message: hide(clean(/closed/i.test(msg) && last ? last : msg, 300)) })
  } finally {
    await finish()
  }
}
