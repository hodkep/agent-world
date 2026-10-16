import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const skill = (dir: string, name: string, desc: string, body: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`)
}

test('the check before acting is part of the playbook, and what agents said when they passed an item over, shown when its row opens', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-habits-'))
  const lib = join(home, 'aw', 'library')
  skill(join(lib, 'skills', 'tdd'), 'tdd', 'Test-driven development.', '# TDD')
  skill(join(lib, 'skills', 'resolving-merge-conflicts'), 'resolving-merge-conflicts', 'Resolve a git merge conflict.', '# Merge')
  mkdirSync(join(lib, 'playbooks'), { recursive: true })
  writeFileSync(join(lib, 'playbooks', 'global.json'), JSON.stringify({ rules: [
    { id: 'tdd', mode: 'on-demand', when: 'building a feature test first', strength: 'hard' },
    { id: 'resolving-merge-conflicts', mode: 'on-demand', when: 'a merge stopped with conflict markers', strength: 'medium' }
  ] }))
  const u = (id: string, how: string, turn: number, extra: object = {}) => JSON.stringify({ t: Date.now(), agent: 'x1', name: 'cocain', provider: 'claude', workspace: 'w', id, how, turn, launch: 1, ...extra })
  const rows: string[] = []
  for (let i = 1; i <= 10; i++) rows.push(u('resolving-merge-conflicts', 'triggered', i))
  for (const i of [1, 2]) rows.push(u('resolving-merge-conflicts', 'fetched', i))
  for (const [i, why] of [[3, 'Trivial, both sides only appended'], [4, 'trivial, both sides only appended.'], [5, 'Trivial, both sides only appended'], [6, 'trivial, both sides only appended'], [7, 'no conflict markers left'], [8, 'No conflict markers left']] as [number, string][]) rows.push(u('resolving-merge-conflicts', 'skipped', i, { reason: why }))
  writeFileSync(join(lib, 'uses.jsonl'), rows.join('\n') + '\n')
  const project = join(home, 'project')
  mkdirSync(project)
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await page.getByRole('button', { name: 'Library' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Library' })

    // The Playbook: there is no separate switch, and the reminder always shows the check once.
    await dialog.getByRole('tab', { name: 'Playbook' }).click()
    await expect(dialog.getByRole('switch', { name: 'Check before acting' })).toHaveCount(0)
    const reminder = dialog.locator('h4', { hasText: 'Reminder' }).locator('xpath=following-sibling::p[1]')
    await expect(reminder).toContainText('library_skip')
    expect((await reminder.textContent())!.match(/Decide silently/g)).toHaveLength(1)

    // Reached for: the numbers say how many said no; opening the row lists what they said, grouped, with advice.
    await dialog.getByRole('tab', { name: 'Reached for' }).click()
    const row = dialog.getByRole('button', { name: /resolving-merge-conflicts/ })
    await expect(row).toContainText('6 said no')
    await expect(row).toContainText('2 passed over without a word')
    await row.click()
    const said = dialog.getByLabel('What agents said about resolving-merge-conflicts')
    await expect(said).toContainText('“trivial, both sides only appended” ×4')
    await expect(said).toContainText('“no conflict markers left” ×2')
    await expect(said).toContainText('Make it narrower')
  } finally {
    await shutdown()
  }
})
