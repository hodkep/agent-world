import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('an agent starts another as its subagent: it answers the call, is left out of the office, and shows in the parent\'s subagents', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-spawn-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '300', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SPAWN: 'ada:claude:read the exporter and tell me what it does' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await approve(page).catch(() => {})
    await page.locator('.roster button', { hasText: 'ada' }).click()
    await expect(page.locator('.term-host:visible')).toContainText(/spawn_subagent → /, { timeout: 60_000 })
    await expect(page.locator('.term-host:visible')).toContainText('"status":"done"')

    const agents = await page.evaluate(() => window.aw.listAgents())
    expect(agents.map((a) => a.name)).toEqual(['ada'])
    const subs = await page.evaluate((id) => window.aw.subagents(id), agents[0]!.id)
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ type: 'claude', done: true, description: 'read the exporter and tell me what it does' })
    expect(subs[0]!.result).toContain('Done.')
    const talk = await page.evaluate(([id, sub]) => window.aw.subagentChat(id!, sub!), [agents[0]!.id, subs[0]!.agentId])
    expect(talk.some((i) => i.kind === 'assistant')).toBe(true)
  } finally {
    await shutdown()
  }
})
