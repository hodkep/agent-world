import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'Saved in localStorage.' }] })

const JOURNEY = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'approve' }] }

async function office(name: string) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_AUDIT: FINDINGS }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page, { name: 'ada' })
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  await expect.poll(() => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
  const env = JSON.parse(readFileSync(envFile, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string; git: Record<string, string> }
  // git as the agent's own processes run it: the environment the app started the agent with.
  const asAgent = (cwd: string, ...args: string[]) =>
    new Promise<{ ok: boolean; out: string }>((done) =>
      execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
    )
  // The agent's task, with its plan approved, and one commit on its branch.
  const log = join(home, 'runs.jsonl')
  const t = Date.now()
  appendFileSync(log, [
    { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle', workflow: JOURNEY },
    { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
    { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
  git(ada!.cwd, 'add', '-A')
  git(ada!.cwd, 'commit', '-qm', 'add toggle')
  const merge = () => asAgent(repo, 'merge', '--ff-only', ada!.branch!)
  const landed = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.landed as { how: string; held: string[] } | undefined
  return { repo, git, page, ada: ada!, shutdown, merge, landed }
}

test('an agent that merges its branch into main from the chat is held by git itself while the review has findings the person has not seen, and lands once the person allows it', async () => {
  const o = await office('wfland')
  try {
    // The review has not run: the merge is refused, in the office's words, and the review starts.
    const first = await o.merge()
    expect(first.ok).toBe(false)
    expect(first.out).toContain('Agent World: this change to a branch is held. Not yet: The review has not run for this branch yet.')
    expect(o.git(o.repo, 'log', '--format=%s', '-1', 'main')).toBe('init')
    // Its findings arrive: they are unseen, and the person is asked in that agent's chat (the held merge is listed for it).
    await expect.poll(async () => (await o.merge()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await expect.poll(() => o.page.evaluate(() => window.aw.landingHolds())).toEqual([expect.objectContaining({ agentId: o.ada.id, held: ['2 audit findings have not been seen.'] })])
    expect(o.git(o.repo, 'log', '--format=%s', '-1', 'main')).toBe('init')
    expect(await o.landed()).toBeUndefined()
    // The agent cannot allow it; the person does, and the agent's next try goes through and is logged as landing anyway, with what held it.
    await o.page.evaluate((id) => window.aw.landingAllow(id), o.ada.id)
    expect((await o.merge()).ok).toBe(true)
    expect(o.git(o.repo, 'log', '--format=%s', '-1', 'main')).toBe('add toggle')
    await expect.poll(o.landed).toMatchObject({ how: 'anyway', held: ['2 audit findings have not been seen.'] })
    expect(await o.page.evaluate(() => window.aw.landingHolds())).toEqual([])
  } finally {
    await o.shutdown()
  }
})

test('the same merge goes through with no say from the person once the findings were seen, and is logged as landed', async () => {
  const o = await office('wfland2')
  try {
    await o.merge()
    await expect.poll(async () => (await o.merge()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await o.page.evaluate((id) => window.aw.finishSeen(id, [0, 1]), o.ada.id)
    expect((await o.merge()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'checked', held: [] })
    expect(await o.page.evaluate(() => window.aw.landingHolds())).toEqual([])
  } finally {
    await o.shutdown()
  }
})

test('a held merge shows in the agent\'s chat as a marker on the track and a card at the end of the conversation, never above the message box; all seen clears what holds it and the next try goes through', async () => {
  const o = await office('wfland3')
  try {
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.merge()
    await expect.poll(async () => (await o.merge()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    const track = o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).first()
    const card = o.page.getByRole('region', { name: "ada's merge is held" })
    await expect(track.getByText('Land held', { exact: true })).toBeVisible()
    await expect(card).toBeVisible()
    await expect(card).toContainText('2 audit findings have not been seen.')
    // It is the last thing in the conversation: inside the log, and nothing of the kind sits between the log and the message box.
    await expect(o.page.locator('.chat-log').getByRole('region', { name: "ada's merge is held" })).toHaveCount(1)
    await expect(o.page.locator('.finish-band, .land-band')).toHaveCount(0)
    const [log, box, c] = [await o.page.locator('.chat-log').boundingBox(), await o.page.getByRole('textbox', { name: 'Message ada' }).boundingBox(), await card.boundingBox()]
    expect(c!.y + c!.height).toBeLessThanOrEqual(log!.y + log!.height + 1)
    expect(c!.y + c!.height).toBeLessThanOrEqual(box!.y)
    // The agent's Workflow tab says the same status on the track.
    await o.page.getByRole('tab', { name: /^Workflow/ }).click()
    // These look at the rail; the tab shows the flow first.
    await o.page.getByRole('button', { name: 'Rail' }).click()
    await expect(o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).last()).toContainText('Land held')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await card.getByRole('button', { name: 'All seen, fine' }).click()
    await expect(card).toHaveCount(0)
    expect((await o.merge()).ok).toBe(true)
    await expect(track.getByText(/Land held/)).toHaveCount(0)
    await expect.poll(o.landed).toMatchObject({ how: 'checked' })
  } finally {
    await o.shutdown()
  }
})

test('Set aside on a held merge lifts the hold and records the audit as not followed, with a quiet line and Undo, and the next try goes through', async () => {
  const o = await office('wfland4')
  try {
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.merge()
    await expect.poll(async () => (await o.merge()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    const card = o.page.getByRole('region', { name: "ada's merge is held" })
    await card.getByRole('button', { name: 'Set aside' }).click()
    await expect(card).toHaveCount(0)
    const line = o.page.getByRole('note', { name: "ada's audit, set aside" })
    await expect(line).toContainText('You set the audit aside · 2 things not looked at')
    // The track marks the step, and the run's own story says it.
    await expect(o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).first()).toBeVisible()
    expect((await o.merge()).ok).toBe(true)
    await o.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = o.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('table', { name: 'Runs' }).getByRole('button', { name: /Add a dark-mode toggle/ }).click()
    await expect(win.getByRole('region', { name: 'How Add a dark-mode toggle went' })).toContainText('You set the review aside with 2 things not looked at')
  } finally {
    await o.shutdown()
  }
})
