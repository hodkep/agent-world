// A small MCP server over stdio, for the tests of connecting to a server. Not shipped: it only runs from the tests.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

if (process.env.FIXTURE_FAIL) {
  process.stderr.write(`Error: SUPABASE_ACCESS_TOKEN is not set${process.env.SECRET_VALUE ? ` (got ${process.env.SECRET_VALUE})` : ''}\n`)
  process.exit(3)
}
if (process.env.FIXTURE_HANG) setInterval(() => {}, 1000)
else {
  const s = new McpServer({ name: 'fixture', version: '1.2.3' })
  s.registerTool('echo', { description: 'Says back what it is told.', inputSchema: { text: z.string(), times: z.number().optional() }, annotations: { readOnlyHint: true } }, async ({ text }) => ({ content: [{ type: 'text', text }] }))
  s.registerTool('wipe', { description: 'Deletes everything.\u0007 <b>bold</b>', inputSchema: { target: z.enum(['a', 'b']) }, annotations: { destructiveHint: true } }, async () => ({ content: [{ type: 'text', text: 'done' }] }))
  s.registerTool('plain', { description: 'x'.repeat(5000) }, async () => ({ content: [{ type: 'text', text: 'ok' }] }))
  await s.connect(new StdioServerTransport())
}
