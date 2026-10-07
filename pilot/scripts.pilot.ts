import { execFile } from 'node:child_process'
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { createLibraryService } from '../src/main/library/service'
import { agentEnv } from '../src/main/providers/claude/launch'

/**
 * Can a real agent run a skill's bundled script by the absolute path the library gives it?
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/scripts.pilot.ts
 * The script prints a number only it can compute, so a right answer proves it ran. Claude with the folder allowed and not; agy with
 * the folder added (default permissions, then skipping them) and not.
 */
const REPORT = 'pilot-scripts-report.txt'
const sh = (bin: string, args: string[], cwd: string) =>
  new Promise<string>((resolve) => execFile(bin, args, { cwd, env: agentEnv(process.env), timeout: 240_000, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => resolve(out || String(errOut || err))))

describe.skipIf(!process.env.PILOT)('a skill with a bundled script, run by absolute path', () => {
  it('works for Claude and agy, with and without the library folder added', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-pilot-scripts-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    const svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'p' ? { id, name: 'p', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'w' })
    const src = join(dir, 'src', 'pilot-calc')
    mkdirSync(join(src, 'scripts'), { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), '---\nname: pilot-calc\ndescription: Computes the workspace checksum.\n---\n\nTo get the workspace checksum for a number N, run the script scripts/checksum.sh with N as its argument and report exactly what it prints.')
    writeFileSync(join(src, 'scripts', 'checksum.sh'), '#!/bin/sh\necho "CHECKSUM-$(( $1 * 7 + 3 ))-QZX"\n')
    chmodSync(join(src, 'scripts', 'checksum.sh'), 0o755)
    await svc.library.addSkillFolder(src, 'pilot')
    svc.playbooks.write({ workspace: 'w' }, [{ id: 'pilot-calc', mode: 'on-demand', when: 'when asked for the workspace checksum', strength: 'soft' }])
    // Exactly what library_get hands an agent.
    const got = await svc.get('p', 'pilot-calc')
    const script = join(dir, 'library', 'skills', 'pilot-calc', 'scripts', 'checksum.sh')
    const prompt = `You asked the library for a skill and it returned this:\n\n${got}\n\nFollow it: what is the workspace checksum for 6? Reply with exactly what the script printed.`
    const lib = join(dir, 'library')
    const WANT = 'CHECKSUM-45-QZX'
    const cases: [string, string, string[]][] = [
      ['Claude, folder added, script allowed', 'claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--add-dir', lib, '--allowedTools', `Bash(${script}:*)`, '--max-turns', '6']],
      ['Claude, folder NOT added, script allowed', 'claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--allowedTools', `Bash(${script}:*)`, '--max-turns', '6']],
      ['Claude, folder added, nothing allowed', 'claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--add-dir', lib, '--max-turns', '6']],
      ['agy, folder added, default permissions', 'agy', ['-p', prompt, '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--add-dir', lib]],
      ['agy, folder added, permissions skipped', 'agy', ['-p', prompt, '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--add-dir', lib, '--dangerously-skip-permissions']],
      ['agy, folder NOT added, permissions skipped', 'agy', ['-p', prompt, '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--dangerously-skip-permissions']]
    ]
    writeFileSync(REPORT, `Script: ${script}\nWanted: ${WANT}\n\n`)
    for (const [label, bin, args] of cases) {
      const out = await sh(bin, args, work)
      let text = out
      try {
        const j = JSON.parse(out) as { result?: string; response?: string }
        text = j.result ?? j.response ?? out
      } catch {
        /* the raw output says what happened */
      }
      appendFileSync(REPORT, `[${label}] ${text.includes(WANT) ? 'RAN' : 'DID NOT RUN'}: ${JSON.stringify(text.slice(0, 220))}\n`)
    }
  })
})
