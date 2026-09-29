import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AgentEvent, AgentStats, Decision, PermissionRequest } from '../shared/types'
import { describeTool, normalize } from './events'
import { parseStatus, statusText } from './status'

// Write tool payloads carry whole files; anything past this is not a legit hook call.
const MAX_BODY = 10 * 1024 * 1024

interface Options {
  /** Each agent's hooks and statusline carry its own token; the token says which agent is talking. */
  agentForToken: (token: string) => string | null
  permissionTimeoutMs: number
  onEvent: (e: AgentEvent) => void
  onPermission: (r: PermissionRequest) => void
  onPermissionSettled: (id: string) => void
  onStatus: (s: AgentStats, agentId: string) => void
  /** A plan is ready for review (the ExitPlanMode tool). */
  onPlan: (p: { agentId: string; plan: string }) => void
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        resolve(null)
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}


export async function startHookServer(o: Options) {
  const pending = new Map<string, (d: Decision | null) => void>()

  const holdPermission = (payload: Record<string, unknown>, res: ServerResponse, agentId: string) => {
    const id = randomUUID()
    const sessionId = String(payload.session_id)
    const subagentId = typeof payload.agent_id === 'string' ? payload.agent_id : undefined
    const tool = typeof payload.tool_name === 'string' ? payload.tool_name : 'unknown'
    const detail = describeTool(payload.tool_input) ?? tool

    const settle = (d: Decision | null) => {
      if (!pending.delete(id)) return
      clearTimeout(timer)
      o.onPermissionSettled(id)
      // An empty answer means "no decision": Claude shows its own terminal dialog instead.
      if (d) res.setHeader('content-type', 'application/json').end(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: d } } })
      )
      else res.end()
    }
    const timer = setTimeout(() => settle(null), o.permissionTimeoutMs)
    pending.set(id, settle)
    res.on('close', () => settle(null))

    o.onEvent({ type: 'activity', agentId, sessionId, ...(subagentId && { subagentId }), activity: 'permission', tool, detail })
    o.onPermission({ id, agentId, sessionId, tool, detail })
  }

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || (req.url !== '/hook' && req.url !== '/status')) return void res.writeHead(404).end()
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    const agentId = bearer ? o.agentForToken(bearer) : null
    if (!agentId) return void res.writeHead(401).end()
    const body = await readBody(req)
    if (body === null) return void res.writeHead(413).end()

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return void res.writeHead(400).end()
    }
    // Debugging aid: AW_HOOK_LOG=<file> records every raw payload, to learn shapes the docs leave out.
    if (process.env.AW_HOOK_LOG) appendFileSync(process.env.AW_HOOK_LOG, `${JSON.stringify({ url: req.url, agentId, payload })}\n`)
    if (req.url === '/status') {
      const stats = parseStatus(payload)
      if (!stats) return void res.writeHead(400).end()
      o.onStatus(stats, agentId)
      return void res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(statusText(stats))
    }
    const p = payload as Record<string, unknown>
    if (p?.hook_event_name === 'PermissionRequest' && typeof p.session_id === 'string') {
      // A hook "allow" does not approve a plan (the session stays in plan mode), so let Claude show its own
      // plan menu and hand the plan to the app, which answers that menu for the user.
      if (p.tool_name === 'ExitPlanMode') {
        const plan = typeof (p.tool_input as Record<string, unknown>)?.plan === 'string' ? ((p.tool_input as Record<string, unknown>).plan as string) : ''
        o.onEvent({ type: 'activity', agentId, sessionId: p.session_id, activity: 'permission', tool: 'ExitPlanMode', detail: 'plan ready for review' })
        o.onPlan({ agentId, plan })
        return void res.writeHead(200).end()
      }
      return holdPermission(p, res, agentId)
    }

    const event = normalize(payload)
    if (event) o.onEvent({ ...event, agentId })
    res.writeHead(200).end()
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/hook`,
    decide: (id: string, d: Decision) => pending.get(id)?.(d),
    close: () => {
      for (const settle of [...pending.values()]) settle(null)
      server.closeAllConnections()
      server.close()
    }
  }
}
