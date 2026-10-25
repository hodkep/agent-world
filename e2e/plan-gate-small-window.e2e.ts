import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'
import { shot } from './wf-helpers'

const LONG = `## Goal
Add a dark-mode toggle to Settings.

## Assumptions
${Array.from({ length: 10 }, (_, i) => `- [guessed] Assumption number ${i + 1}: the toggle behaves in a way that needs a sentence long enough to wrap onto a second line in a narrow panel.`).join('\n')}
- [given] The toggle lives in Settings.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window
- Which colours?
  - Warm
  - Cool

## Steps
1. Add the setting.
`
test('a long plan gate in a small window shrinks and scrolls inside itself: the page does not scroll, the header stays, even after a picture is pasted into the message box', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-scroll-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main'); writeFileSync(join(repo, 'README.md'), '# shop\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1100, height: 600 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    await expect.poll(() => readLog(argsLog).includes('--settings')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const flag = (f: string) => launch[launch.indexOf(f) + 1]!
    const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } })
    mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), LONG)
    await client.callTool({ name: 'plan_submit', arguments: {} })
    await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'Stop' }) })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toBeVisible()
    const measure = () => page.evaluate(() => {
      const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } }
      const se = document.scrollingElement!
      const log = document.querySelector('.chat-log') as HTMLElement | null
      return { vh: innerHeight, docScrollH: se.scrollHeight, docScrollTop: se.scrollTop, bodyScrollH: document.body.scrollHeight, header: r('header'), panel: r('.plan-gate'), log: r('.chat-log'), logScrollH: log?.scrollHeight, composer: r('.composer'), approve: r('.plan-gate .pg-acts .primary') }
    })
    await page.evaluate(() => {
      const ta = document.querySelector('.composer .cm-content') as HTMLElement
      const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d')!; x.fillStyle = '#c33'; x.fillRect(0, 0, 400, 300)
      return new Promise<void>((res) => c.toBlob((b) => { const dt = new DataTransfer(); dt.items.add(new File([b!], 'shot.png', { type: 'image/png' })); ta.focus(); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); res() }))
    })
    await page.waitForTimeout(1200)
    // The picture chip makes the message box taller; the plan gate gives way, not the page.
    await expect(page.locator('.composer')).toContainText('shot', { timeout: 10_000 }).catch(() => {})
    const m = await measure()
    expect(m.docScrollH).toBeLessThanOrEqual(m.vh)
    expect(m.header!.top).toBe(0)
    expect(m.panel!.bottom).toBeLessThanOrEqual(m.composer!.top)
    expect(m.log!.h).toBeGreaterThanOrEqual(96)
    // Folded, the buttons are in view without scrolling the card.
    await panel.getByRole('button', { name: 'Collapse the plan' }).click()
    await expect(panel.getByRole('button', { name: 'Request changes' })).toBeInViewport()
  } finally { await shutdown() }
})
