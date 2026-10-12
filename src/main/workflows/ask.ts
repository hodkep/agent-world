import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { Launch } from '../command'

/** What claude prints with `--output-format json`: the reply, its cost and the model that answered. */
export function parseAsk(stdout: string): { text: string; cost?: number; model?: string } {
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
export function askClaude(launch: Launch, model: string, prompt: string, env: NodeJS.ProcessEnv, timeoutMs = 120_000): Promise<{ text: string; cost?: number; model?: string }> {
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
