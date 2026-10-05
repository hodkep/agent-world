import { execFile } from 'node:child_process'
import type { Provider } from '../ports'
import { agyEvents } from './events'
import { agyKeys } from './keys'
import { agyArgs, agyModes, parseUsage } from './launch'
import { agyScreen } from './screen'
import { agyTranscript } from './transcript'

const run = (file: string, args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(file, args, { timeout: 20_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))))

export const agy: Provider = {
  id: 'agy',
  label: 'agy (Antigravity)',
  bin: 'agy',
  capabilities: { permissionsInWorld: true, liveModeSwitch: true, subagents: false, rewind: false, compact: false, limits: true, tools: false, mail: false },
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
  prepare: () => ({}),
  args: agyArgs,
  events: agyEvents,
  transcript: agyTranscript,
  screen: agyScreen,
  keys: agyKeys,
  models: [
    { value: '', label: 'Default model' },
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B' }
  ],
  modes: agyModes,
  hireModes: [
    { value: '', label: "agy's default", hint: 'Asks before it edits or runs anything' },
    { value: 'request-review', label: 'Ask first', hint: 'Every edit and command waits for your approval' },
    { value: 'accept-edits', label: 'Accept edits', hint: 'File edits go through; commands still ask' },
    { value: 'plan', label: 'Plan first', hint: 'Researches and plans; changes nothing until you approve' },
    { value: 'skip-permissions', label: 'Skip permissions', hint: 'Nothing is asked. Only for a sandbox' }
  ],
  autonomy: { ask: 'request-review', edit: 'accept-edits', plan: 'plan', full: 'skip-permissions' }
}
