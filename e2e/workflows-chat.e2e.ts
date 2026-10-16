import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const j = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
const JOURNEY = {
  id: 'journey',
  name: 'Journey',
  steps: [
    { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'check', name: 'Project check', run: 'node check.js', retries: 2 },
    { id: 'review', kind: 'audit', name: 'Review' },
    { id: 'land', kind: 'merge', name: 'Land', gate: 'approve' }
  ]
}

test('chat: the calls that move a run leave the conversation, the office\'s own calls are stamps, and a failed call stays a card', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfchat-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_RUNCALLS: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add wordCount')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Done with wordCount.', { timeout: 45_000 })

    // The library read is a stamp, with the sentence in its tip.
    const stamps = log.locator('.of-head .stamp')
    await expect(stamps).toHaveCount(1)
    await expect(stamps.first()).toHaveAttribute('title', 'Read tdd · 2 lines')
    // Beginning, planning, reporting a step and finishing are not in the conversation; the one report that failed is, as a card.
    await expect(log.getByText('Task begun')).toHaveCount(0)
    await expect(log.getByText('Plan submitted')).toHaveCount(0)
    const report = log.locator('.tc', { hasText: 'Step done' })
    await expect(report).toHaveCount(1)
    await expect(report).toContainText('failed')
    await expect(log.locator('.tc', { hasText: 'Task done' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('chat: the track above the conversation stands where the run is, with a bubble while the plan waits for the person, and moves on when it is approved', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wftrack-'))
  const project = join(home, 'project')
  mkdirSync(project)
  mkdirSync(join(home, 'aw'), { recursive: true })
  writeFileSync(join(home, 'aw', 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const now = Date.now()
    const begin = { k: 'begin', t: now - 60_000, run: 'r1', agent: ada!.id, name: 'ada', project, title: 'Add wordCount', workflow: JOURNEY }
    const readback = { goal: 'wordCount', assumptions: [], outOfScope: [], questions: [] }
    const submitted = { k: 'plan', t: now - 50_000, run: 'r1', round: 1, state: 'submitted', path: 'p.md', readback }
    writeFileSync(join(home, 'aw', 'runs.jsonl'), j([begin, submitted]))
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()

    const track = page.getByRole('region', { name: 'Add wordCount: where ada is' })
    await expect(track).toBeVisible()
    await expect(track.locator('.nm')).toHaveText(['Plan', 'Build', 'Project check', 'Review', 'Land'])
    await expect(track.locator('.st.now')).toContainText('Plan')
    await expect(track.getByRole('status')).toHaveText('needs your approval')

    // Approved: the plan is met and ada is on the build, with nothing waiting on the person.
    writeFileSync(join(home, 'aw', 'runs.jsonl'), j([begin, submitted, { k: 'plan', t: now - 40_000, run: 'r1', round: 1, state: 'approved' }]))
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    const moved = page.getByRole('region', { name: 'Add wordCount: where ada is' })
    await expect(moved.locator('.st.done')).toContainText('Plan')
    await expect(moved.locator('.st.now')).toContainText('Build')
    await expect(moved.getByRole('status')).toHaveCount(0)

    // Landed: nothing is left to show, so the track is gone.
    const merge = [{ k: 'step', t: now - 30_000, run: 'r1', round: 1, step: 'build', state: 'done' }, { k: 'check', t: now - 29_000, run: 'r1', round: 1, step: 'tests', head: 'h1', attempt: 1, ok: true, exit: 0, timedOut: false, ms: 100, tail: '' }, { k: 'audit', t: now - 28_000, run: 'r1', head: 'h1', state: 'done', findings: [], files: 1, lines: 1, truncated: false }, { k: 'merge', t: now - 27_000, run: 'r1', head: 'h1', how: 'checked', held: [] }, { k: 'done', t: now - 26_000, run: 'r1' }]
    writeFileSync(join(home, 'aw', 'runs.jsonl'), j([begin, submitted, { k: 'plan', t: now - 40_000, run: 'r1', round: 1, state: 'approved' }, ...merge]))
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByRole('region', { name: 'Add wordCount: where ada is' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
