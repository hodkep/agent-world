import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The agy plugin that lets the office see what an agy agent does with the library. agy has no per-session flag for plugins, so it is installed once and does nothing unless the office started the agent. */
export const PLUGIN_NAME = 'aw-library'

// Each hook posts what agy sends to the office, with the token of this agent (both are in the environment the office starts agy with); anything that goes wrong answers {} so agy carries on.
export const HOOK_SCRIPT = `#!/bin/sh
# Part of Agent World: tells the office about a step of this agent so it can point it at the library. Safe to delete.
[ -n "$AW_MCP_URL" ] && [ -n "$AW_AGENT_TOKEN" ] || { echo '{}'; exit 0; }
out=$(curl -s --max-time 3 -X POST -H "Authorization: Bearer $AW_AGENT_TOKEN" -H "Content-Type: application/json" --data-binary @- "\${AW_MCP_URL%/mcp}/hook/$1")
# printf, not echo: some shells' echo turns the \\n inside a JSON string into a real newline, which agy then rejects
[ -n "$out" ] && printf '%s\\n' "$out" || echo '{}'
`

export const HOOKS = {
  [PLUGIN_NAME]: {
    PreInvocation: [{ type: 'command', command: './hook.sh pre-inv' }],
    PostToolUse: [{ matcher: 'view_file', hooks: [{ type: 'command', command: './hook.sh post-tool' }] }]
  }
}

/** Writes the plugin's three files into `dir`. */
export function writeAgyPlugin(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify({ name: PLUGIN_NAME, version: '0.1.0', description: 'Agent World: points agents at the shared library and counts what they use.' }, null, 2))
  writeFileSync(join(dir, 'hooks.json'), JSON.stringify(HOOKS, null, 2))
  writeFileSync(join(dir, 'hook.sh'), HOOK_SCRIPT)
  chmodSync(join(dir, 'hook.sh'), 0o755)
}
