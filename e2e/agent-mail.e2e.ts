import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { formatDelivery } from '../src/main/mailbox'
import { hire, launchApp } from './launch'

const LONG =
  'Follow-up on "Change role…" (commit `9710fbb`), from the user, who tried it in a dev instance on your worktree and chose No role. Bug: the current role is never shown as selected in the list. ' +
  '"No role" in particular is never marked, even when the agent has no role. Fix: in the Change role menu, mark the agent\'s current role as selected (checkmark and `aria-checked`). ' +
  'Match the roles by id or by `AgentOptions.role` as the agent\'s stored options hold it; treat an undefined or empty role as "No role" selected.'

async function open(mail: string) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-agentmail-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const file = join(tmp, 'mail.txt')
  writeFileSync(file, mail)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_USER_FILE: file }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Chat' }).click()
  return { page, shutdown, log: page.getByRole('log', { name: 'Conversation with ada' }) }
}

test('a message from another agent is its own card, cut to two lines until you ask for all of it', async () => {
  const { page, shutdown, log } = await open(formatDelivery('grace', LONG, true))
  try {
    const card = log.getByRole('article', { name: 'Message from agent grace' })
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card).toContainText('From agent “grace”')
    await expect(card).toContainText('Asks for a reply')
    await expect(log.locator('.msg.user')).toHaveCount(0) // not shown as something you typed
    await expect(log).not.toContainText('[Agent World]')
    await expect(card).not.toContainText('expects_reply') // the instruction line is not the sender's words
    await expect(card.locator('code').first()).toHaveText('9710fbb')

    const body = card.locator('.mail-body')
    const folded = (await body.boundingBox())!.height
    expect(folded).toBeLessThan(2 * 20 + 4) // two lines at 13px / 1.45
    await expect(card).toContainText('treat an undefined or empty role') // all of it is in the page, so it can be selected
    await expect(card.getByText('reply → send_message')).toHaveCount(0)

    const toggle = card.getByRole('button', { name: 'Read more' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect.poll(async () => (await body.boundingBox())!.height).toBeGreaterThan(folded * 2)
    await expect(card.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    await expect(card.getByText('reply → send_message to “grace”')).toBeVisible()
    await page.screenshot({ path: join(tmpdir(), 'aw-agent-mail-open.png') })

    await card.getByRole('button', { name: 'Show less' }).click()
    await expect.poll(async () => (await body.boundingBox())!.height).toBe(folded)
    await page.screenshot({ path: join(tmpdir(), 'aw-agent-mail-folded.png') })
  } finally {
    await shutdown()
  }
})

test('a short reply from another agent is a card with no fold button', async () => {
  const { shutdown, log } = await open(formatDelivery('ada', 'Two nits in `auth.ts`, no blockers.', false))
  try {
    const card = log.getByRole('article', { name: 'Message from agent ada' })
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card).toContainText('From agent “ada”')
    await expect(card.locator('.mail-tag')).toHaveText('Reply')
    await expect(card).toContainText('Two nits in auth.ts, no blockers.')
    await expect(card.getByRole('button')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('your own message that happens to be long is still your bubble', async () => {
  const { shutdown, log } = await open(Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n'))
  try {
    await expect(log.locator('.msg.user').first()).toContainText('line 40', { timeout: 15_000 })
    await expect(log.getByRole('article')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
