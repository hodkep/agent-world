import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AgentEvent, Decision, PermissionRequest } from '../../../shared/types'
import type { EventHandle, EventSourceOptions } from '../ports'
import { activityFor, describeTool, normalize } from './events'
import { parseStatus, statusText } from './status'

// Write tool payloads carry whole files; anything past this is not a legit hook call.
const MAX_BODY = 10 * 1024 * 1024

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


export async function startHookServer(o: EventSourceOptions): Promise<EventHandle> {
  interface Held {
    settle: (d: Decision | null) => void
    agentId: string
    sessionId: string
    toolUseId?: string
    tool: string
    detail: string
  }
  const pending = new Map<string, Held>()
  // Claude also shows its own prompt; if the user answers there, the held hook call is simply never used.
  const release = (match: (h: Held) => boolean) => {
    for (const h of [...pending.values()]) if (match(h)) h.settle(null)
  }

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
      // Claude reports nothing while an allowed tool runs, so the office would keep showing "waiting on you".
      if (d === 'allow') o.onEvent({ type: 'activity', agentId, sessionId, ...(subagentId && { subagentId }), activity: activityFor(tool), tool, detail })
      else if (d === 'deny') o.onEvent({ type: 'activity', agentId, sessionId, ...(subagentId && { subagentId }), activity: 'thinking' })
    }
    const timer = setTimeout(() => settle(null), o.permissionTimeoutMs)
    const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : undefined
    pending.set(id, { settle, agentId, sessionId, toolUseId, tool, detail })
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
    if (p?.tool_input && typeof p.tool_input === 'object') o.onToolInput?.(agentId, JSON.stringify(p.tool_input))
    if (p?.hook_event_name === 'PermissionRequest' && typeof p.session_id === 'string') {
      // A hook "allow" does not approve a plan (the session stays in plan mode), so let Claude show its own
      // plan menu; the app watches the screen for it and answers it for the user. The plan text itself
      // arrives with the PreToolUse event.
      if (p.tool_name === 'ExitPlanMode') {
        o.onEvent({ type: 'activity', agentId, sessionId: p.session_id, activity: 'permission', tool: 'ExitPlanMode', detail: 'plan ready for review' })
        return void res.writeHead(200).end()
      }
      // Same for questions: the app reads them from PreToolUse and answers Claude's own menu.
      if (p.tool_name === 'AskUserQuestion') {
        o.onEvent({ type: 'activity', agentId, sessionId: p.session_id, activity: 'permission', tool: 'AskUserQuestion', detail: 'has a question for you' })
        return void res.writeHead(200).end()
      }
      return holdPermission(p, res, agentId)
    }

    // Any sign that Claude moved past a held permission means it was answered in the terminal.
    const hookEvent = p?.hook_event_name
    if ((hookEvent === 'PostToolUse' || hookEvent === 'PostToolUseFailure') && typeof p.tool_use_id === 'string')
      release((h) => h.agentId === agentId && h.toolUseId === p.tool_use_id)
    else if (hookEvent === 'Stop' || hookEvent === 'UserPromptSubmit' || hookEvent === 'StopFailure' || hookEvent === 'SessionEnd') release((h) => h.agentId === agentId)
    const event = normalize(payload)
    if (event) o.onEvent({ ...event, agentId })
    // The text Claude adds to what it was just asked, so a rule the agent might drift from is in front of it again this turn.
    if (hookEvent === 'PreToolUse' && typeof p.tool_name === 'string' && p.tool_input && typeof p.tool_input === 'object') o.onToolUse?.(agentId, p.tool_name, p.tool_input as Record<string, unknown>)
    if (hookEvent === 'PostCompact') o.onCompact?.(agentId)
    const reminder = hookEvent === 'UserPromptSubmit' ? o.reminderFor?.(agentId, typeof p.prompt === 'string' ? p.prompt : '') : null
    // What the agent met in the middle of a run (a merge conflict): the playbook may have something for it, said right after the tool that showed it.
    const met = hookEvent === 'PostToolUse' && typeof p.tool_name === 'string' ? o.situationFor?.(agentId, p.tool_name, (p.tool_input ?? {}) as Record<string, unknown>, p.tool_response) : null
    if (met) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: met } }))
    if (reminder) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reminder } }))
    res.writeHead(200).end()
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/hook`,
    decide: (id: string, d: Decision) => pending.get(id)?.settle(d),
    /** The agent's terminal prompt went away (answered there): drop its cards and resume the tool it asked about. */
    dismiss: (agentId: string) => {
      const held = [...pending.values()].filter((h) => h.agentId === agentId)
      release((h) => h.agentId === agentId)
      const last = held.at(-1)
      if (last) o.onEvent({ type: 'activity', agentId, sessionId: last.sessionId, activity: activityFor(last.tool), tool: last.tool, detail: last.detail })
    },
    hasPending: (agentId: string) => [...pending.values()].some((h) => h.agentId === agentId),
    close: () => {
      for (const h of [...pending.values()]) h.settle(null)
      server.closeAllConnections()
      server.close()
    }
  }
}
