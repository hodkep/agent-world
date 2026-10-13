import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkEnv, runCheck } from './runCheck'

const dir = () => realpathSync(mkdtempSync(join(tmpdir(), 'aw-check-')))
const node = (js: string) => `"${process.execPath}" -e ${JSON.stringify(js)}`

describe('running a check command', () => {
  it('says it passed with exit 0 and what it printed', async () => {
    const r = await runCheck(node("console.log('all good')"), dir())
    expect(r).toMatchObject({ exit: 0, timedOut: false })
    expect(r.tail).toBe('all good')
    expect(r.ms).toBeGreaterThanOrEqual(0)
  })

  it('says it failed with the exit code and what both outputs held, and runs in the folder it is given', async () => {
    const d = dir()
    const r = await runCheck(node("console.log(process.cwd()); console.error('boom'); process.exit(3)"), d)
    expect(r.exit).toBe(3)
    expect(r.timedOut).toBe(false)
    expect(r.tail).toContain('boom')
    expect(r.tail).toContain(d)
  })

  it('a command that does not exist fails with the shell\'s own words', async () => {
    const r = await runCheck('definitely-not-a-command-xyz', dir())
    expect(r.exit).toBe(127)
    expect(r.tail).toMatch(/not found/i)
  })

  it('stops a command at the time limit, children included, and says so', async () => {
    const d = dir()
    const pidFile = join(d, 'child.pid')
    const t = Date.now()
    // The shell starts a child that would outlive it; both must go.
    const r = await runCheck(`${node(`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`)} & wait`, d, { timeoutMs: 600 })
    expect(r).toMatchObject({ exit: null, timedOut: true })
    expect(Date.now() - t).toBeLessThan(5000)
    const pid = Number(readFileSync(pidFile, 'utf8'))
    await new Promise((res) => setTimeout(res, 300))
    expect(() => process.kill(pid, 0)).toThrow()
  })

  it('cleans colour codes and keeps only the end of a long output, cut at a line', async () => {
    const colour = await runCheck(node("console.log('\\x1b[31mred\\x1b[0m text')"), dir())
    expect(colour.tail).toBe('red text')
    const many = await runCheck(node("for (let i = 1; i <= 5000; i++) console.log('line ' + i)"), dir(), { tailBytes: 200 })
    expect(many.tail.length).toBeLessThanOrEqual(220)
    expect(many.tail).toMatch(/^…\nline \d+/)
    expect(many.tail.endsWith('line 5000')).toBe(true)
  })

  it('runs with the environment it is given and no other', async () => {
    const r = await runCheck(node('console.log(String(process.env.FOO) + String(process.env.AW_SECRET))'), dir(), { env: { PATH: process.env.PATH ?? '', FOO: 'bar' } })
    expect(r.tail).toBe('barundefined')
  })
})

describe('the environment a check runs in', () => {
  it('is the app\'s own with the person\'s login PATH, and without anything that belongs to the office, such as the tokens it hands its agents', () => {
    const env = checkEnv({ HOME: '/h', PATH: '/usr/bin', AW_TOKEN: 'secret', AW_CLAUDE_BIN: '/x', ELECTRON_RUN_AS_NODE: '1', KEEP: 'yes' }, '/login/bin:/usr/bin')
    expect(env).toEqual({ HOME: '/h', PATH: '/login/bin:/usr/bin', KEEP: 'yes' })
  })
})
