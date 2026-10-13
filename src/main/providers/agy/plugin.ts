import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The agy plugin that lets the office see what an agy agent does with the library. agy has no per-session flag for plugins, so it is installed once and does nothing unless the office started the agent. */
export const PLUGIN_NAME = 'aw-library'

// Each hook posts what agy sends to the office, with the token of this agent (both are in the environment the office starts agy with); anything that goes wrong answers {} so agy carries on.
// The exception is the check before a tool (pre-tool): agy reads {} there as a denial, because its answer needs a decision, so "nothing to say" is no output at all and agy decides as it always did.
// The token goes to curl on its stdin, never on its command line (another user's `ps` shows that), the payload goes through a private temp file, and nothing is sent anywhere but this computer.
export const HOOK_SCRIPT = `#!/bin/sh
# Part of Agent World: tells the office about a step of this agent so it can point it at the library. Safe to delete.
none() { [ "$1" = pre-tool ] || echo '{}'; }
[ -n "$AW_MCP_URL" ] && [ -n "$AW_AGENT_TOKEN" ] || { none "$1"; exit 0; }
case "$AW_MCP_URL" in http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;; *) none "$1"; exit 0 ;; esac
body=$(mktemp) || { none "$1"; exit 0; }
trap 'rm -f "$body"' EXIT
cat > "$body"
tok=$(printf '%s' "$AW_AGENT_TOKEN" | tr -cd 'A-Za-z0-9._~+/=-')
out=$(printf 'header = "Authorization: Bearer %s"\n' "$tok" | curl -s --max-time 3 -X POST -K - -H "Content-Type: application/json" --data-binary @"$body" "\${AW_MCP_URL%/mcp}/hook/$1")
# printf, not echo: some shells' echo turns the \\n inside a JSON string into a real newline, which agy then rejects
if [ "$1" = pre-tool ]; then
  case "$out" in *'"decision"'*) printf '%s\\n' "$out" ;; esac
else
  [ -n "$out" ] && printf '%s\\n' "$out" || echo '{}'
fi
`

/** The version the plugin is written as: an installed one older than this has not got every hook. */
export const PLUGIN_VERSION = '0.1.3'

/** agy's tools that write a file. */
export const EDIT_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content']

export const HOOKS = {
  [PLUGIN_NAME]: {
    PreInvocation: [{ type: 'command', command: './hook.sh pre-inv' }],
    PostToolUse: [{ matcher: 'view_file', hooks: [{ type: 'command', command: './hook.sh post-tool' }] }],
    // Before agy edits a file: the office may hold the edit back (the plan was not approved). Anything but a held edit gets no answer, so agy decides as it always did.
    PreToolUse: EDIT_TOOLS.map((matcher) => ({ matcher, hooks: [{ type: 'command', command: './hook.sh pre-tool' }] }))
  }
}

/** Writes the plugin's three files into `dir`. */
export function writeAgyPlugin(dir: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify({ name: PLUGIN_NAME, version: PLUGIN_VERSION, description: 'Agent World: points agents at the shared library, counts what they use, and holds an edit back while the plan is not approved.' }, null, 2))
  writeFileSync(join(dir, 'hooks.json'), JSON.stringify(HOOKS, null, 2))
  writeFileSync(join(dir, 'hook.sh'), HOOK_SCRIPT)
  chmodSync(join(dir, 'hook.sh'), 0o755)
}
