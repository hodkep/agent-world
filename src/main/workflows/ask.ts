import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { Launch } from '../command'

/** What one headless question comes back with: the reply, and what it cost, as dollars where the program says so, else as tokens. */
export interface Asked {
  text: string
  cost?: number
  tokens?: number
  model?: string
}

/** What claude prints with `--output-format json`: the reply, its cost and the model that answered. */
export function parseAsk(stdout: string): Asked {
  let out: { is_error?: boolean; result?: unknown; total_cost_usd?: unknown; modelUsage?: Record<string, unknown> }
  try {
    out = JSON.parse(stdout)
  } catch {
    throw new Error('claude printed something unreadable.')
  }
  const text = typeof out.result === 'string' ? out.result : ''
  if (out.is_error) throw new Error(text || 'claude reported an error.')
  const model = Object.keys(out.modelUsage ?? {})[0]
  return { text, ...(typeof out.total_cost_usd === 'number' && { cost: out.total_cost_usd }), ...(model && { model }) }
}

/** A bare question: no tools, skills, MCP servers, saved session or settings, so the call holds only the prompt. */
export const askArgs = (model: string) => ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--disable-slash-commands', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '']

/** One question to claude, sent on stdin (a diff can be larger than a command line allows), from an empty folder so no project file is loaded. */
export function askClaude(launch: Launch, model: string, prompt: string, env: NodeJS.ProcessEnv, timeoutMs = 120_000): Promise<Asked> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.file, [...launch.prefix, ...askArgs(model)], { cwd: tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => (child.kill(), reject(new Error(`claude did not answer within ${Math.round(timeoutMs / 1000)} seconds.`))), timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => (clearTimeout(timer), reject(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        resolve(parseAsk(stdout))
      } catch (e) {
        reject(code === 0 ? e : new Error(stderr.trim().split('\n')[0] || (e as Error).message))
      }
    })
    child.stdin.end(prompt)
  })
}

/** What agy prints with `--output-format json`: the reply and the tokens used (it reports no dollars). A line it printed before the JSON is ignored. */
export function parseAgyAsk(stdout: string, model: string): Asked {
  let out: { status?: string; response?: unknown; usage?: { total_tokens?: unknown }; denied_actions?: { display_name?: string }[] } | undefined
  for (const line of [stdout, ...stdout.split('\n').reverse()]) {
    try {
      out = JSON.parse(line)
      break
    } catch {
      // not the JSON line; try the next
    }
  }
  if (!out || typeof out !== 'object') throw new Error('agy printed something unreadable.')
  const text = typeof out.response === 'string' ? out.response : ''
  if (out.status && out.status !== 'SUCCESS') throw new Error(text.trim() || `agy reported ${out.status}.`)
  if (!text.trim()) {
    const denied = out.denied_actions?.[0]?.display_name
    throw new Error(denied ? `agy needed a permission (${denied}) that a background call cannot ask for.` : 'agy gave no answer.')
  }
  const tokens = out.usage?.total_tokens
  return { text, model, ...(typeof tokens === 'number' && { tokens }) }
}

/** agy takes its prompt as an argument (not on stdin): a read-only mode and no slash commands keep the call to a plain answer. */
export const agyAskArgs = (model: string, prompt: string) => ['-p', prompt, '--model', model, '--output-format', 'json', '--mode', 'plan', '--disable-slash-commands', '--print-timeout', '120s']

/** What agy is told besides the question: it explores by habit, and a background call cannot ask for the permission a tool needs. */
export const agyPrompt = (prompt: string) => `Answer from the text below only. Do not run commands, open files or use any tool: everything you need is here.\n\n${prompt}`

/** Runs `go` again once when agy answered by wanting a permission, which depends on what it chose to do and mostly passes on a second try. */
export async function retryOnce<T>(go: () => Promise<T>): Promise<T> {
  try {
    return await go()
  } catch (e) {
    if (e instanceof Error && e.message.includes('needed a permission')) return go()
    throw e
  }
}

/** One question to agy, from an empty folder so no project file is loaded; asked again once if it wanted a permission. */
export const askAgy = (launch: Launch, model: string, prompt: string, env: NodeJS.ProcessEnv, timeoutMs = 125_000): Promise<Asked> => retryOnce(() => askAgyOnce(launch, model, agyPrompt(prompt), env, timeoutMs))

function askAgyOnce(launch: Launch, model: string, prompt: string, env: NodeJS.ProcessEnv, timeoutMs = 125_000): Promise<Asked> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.file, [...launch.prefix, ...agyAskArgs(model, prompt)], { cwd: tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => (child.kill(), reject(new Error(`agy did not answer within ${Math.round(timeoutMs / 1000)} seconds.`))), timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (e) => (clearTimeout(timer), reject(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        resolve(parseAgyAsk(stdout || stderr, model))
      } catch (e) {
        reject(code === 0 ? e : new Error(stderr.trim().split('\n')[0] || (e as Error).message))
      }
    })
  })
}
