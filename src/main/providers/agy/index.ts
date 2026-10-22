import { execFile } from 'node:child_process'
import type { Provider } from '../ports'
import { agyCommands } from './commands'
import { agyEvents } from './events'
import { agyKeys } from './keys'
import { agyLibraryHook } from './libraryHook'
import { agyMail } from './mail'
import { agyArgs, agyContextWindow, agyModels, agyModes, parseUsage } from './launch'
import { agyScreen } from './screen'
import { agyTools } from './tools'
import { agyCalls, agyCallSamples } from './toolTable'
import { agyTranscript } from './transcript'

const run = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 20_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))

export const agy: Provider = {
  id: 'agy',
  label: 'agy (Antigravity)',
  bin: 'agy',
  capabilities: { permissionsInWorld: true, liveModeSwitch: true, subagents: true, rewind: true, compact: false, limits: true, accounts: false, liveLimits: false, tools: true, mail: false, clone: true, changeRole: false, chrome: false, remote: true, budget: false, sideQuestion: true },
  async detect(bin, ask = run) {
    let version: string | undefined
    try {
      version = /\d+\.\d+\.\d+/.exec(await ask(bin, ['--version']))?.[0]
    } catch {
      return { state: 'not-installed', hint: 'Not found on your PATH or the usual places. Install it, or set where it is in Settings.', install: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' }
    }
    // /usage makes no model call; it only answers once agy is signed in.
    try {
      if (parseUsage(await ask(bin, ['-p', '/usage'])).length) return { state: 'ready', version, path: bin }
    } catch {
      /* treated as not signed in below */
    }
    return { state: 'needs-sign-in', version, path: bin, hint: 'agy is installed but not signed in. Run `agy` once in a terminal and follow the prompts.' }
  },
  env: (env) => env,
  // agy starts the office bridge itself (see mail.ts); the bridge learns who it speaks for from the environment of this terminal.
  prepare: (i) => ({ env: { AW_MCP_URL: i.mcpUrl, AW_AGENT_TOKEN: i.agentToken } }),
  mail: agyMail,
  libraryHook: agyLibraryHook,
  tools: agyTools,
  commands: agyCommands,
  args: agyArgs,
  limits: { read: async (bin, ask = run) => parseUsage(await ask(bin, ['-p', '/usage'])) },
  events: agyEvents,
  transcript: agyTranscript,
  screen: agyScreen,
  keys: agyKeys,
  calls: agyCalls,
  callSamples: agyCallSamples,
  models: [{ value: '', label: 'Default model' }, ...agyModels],
  modes: agyModes,
  rewindConfirms: false,
  contextWindow: agyContextWindow,
  handbook: 'AGENTS.md',
  remoteNote: 'Needs your Google sign-in; the link opens on antigravity.google.com.',
  liveModes: ['request-review', 'accept-edits', 'plan'],
  relaunchModes: ['skip-permissions'],
  hireModes: [
    { value: '', label: "agy's default", hint: 'Asks before it edits or runs anything' },
    { value: 'request-review', label: 'Ask first', hint: 'Every edit and command waits for your approval' },
    { value: 'accept-edits', label: 'Accept edits', hint: 'File edits go through; commands still ask' },
    { value: 'plan', label: 'Plan first', hint: 'Researches and plans; changes nothing until you approve' },
    { value: 'skip-permissions', label: 'Skip permissions', hint: 'Nothing is asked. Only for a sandbox' }
  ],
  autonomy: { ask: 'request-review', edit: 'accept-edits', plan: 'plan', full: 'skip-permissions' }
}
