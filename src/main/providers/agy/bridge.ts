/**
 * agy starts MCP servers itself, from one global list, with its own environment. The office's server is an HTTP one with a token per
 * agent, so what agy starts is this small stdio program: it reads the token and address agy passed on from the app (AW_AGENT_TOKEN,
 * AW_MCP_URL) and hands every message to the office. It is a plain Node script, written to the app's own folder when the user connects agy.
 */
export const BRIDGE_SOURCE = String.raw`#!/usr/bin/env node
'use strict'
const url = process.env.AW_MCP_URL
const token = process.env.AW_AGENT_TOKEN
if (!url || !token) {
  process.stderr.write('agent-world bridge: it is started by Agent World for its own agents; AW_MCP_URL and AW_AGENT_TOKEN are not set.\n')
  process.exit(1)
}
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n')
const fail = (id, message) => id !== undefined && id !== null && send({ jsonrpc: '2.0', id, error: { code: -32000, message } })

async function relay(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + token },
      body: line
    })
    if (res.status === 202 || res.status === 204) return
    if (!res.ok) return fail(msg.id, 'Agent World answered ' + res.status + '.')
    const body = (await res.text()).trim()
    if (body) send(JSON.parse(body))
  } catch {
    fail(msg.id, 'Agent World is not running or cannot be reached.')
  }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => {
  buf += d
  const parts = buf.split('\n')
  buf = parts.pop()
  for (const p of parts) if (p.trim()) void relay(p)
})
process.stdin.on('end', () => process.exit(0))
`
