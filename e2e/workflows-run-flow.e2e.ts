import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }] })
// A check, the audit and the pull request all start when the person presses Run. The workflow has no `scope`, so its commands need no approval.
const FLOW = {
  id: 'runny',
  name: 'Runny',
  steps: [
    { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'check', name: 'Tests', run: 'test -f toggle.ts', start: 'run' },
    { id: 'review', kind: 'audit', name: 'Audit', start: 'run', brief: 'Look hard at the toggle.' },
    { id: 'pr', kind: 'pr', name: 'Pull request', start: 'run' }
  ]
}

test('a run is shown as a flow, with Run on a check and an audit that start that way, Approve and Run on the pull request, and nothing started by the app', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-runflow-')))
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
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_AUDIT: FINDINGS }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    // The agent's task: its plan approved, the work committed and reported done.
    const t = Date.now()
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add toggle')
    appendFileSync(join(home, 'runs.jsonl'), [
      { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle', workflow: FLOW },
      { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: [], questions: [] } },
      { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' },
      { k: 'commit', t: t - 2000, run: 'r1', round: 1, sha: git(ada!.cwd, 'rev-parse', 'HEAD'), subject: 'add toggle' },
      { k: 'step', t: t - 1000, run: 'r1', round: 1, step: 'build', state: 'done' }
    ].map((e) => JSON.stringify(e)).join('\n') + '\n')
    await page.reload()

    // The chat has the press, so no tab has to be opened for one click: the check waits for Run there, and nothing has run.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const gate = page.getByRole('region', { name: 'Run Tests for ada' })
    await expect(gate).toContainText('Nothing has run yet')
    await gate.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Run Audit for ada' })).toContainText('Nothing starts before that.')
    await page.waitForTimeout(2500)
    await expect(page.getByRole('region', { name: 'Run Audit for ada' })).toBeVisible()

    await page.getByRole('tab', { name: 'Workflow' }).click()
    const card = (n: number) => page.locator('.react-flow__node').nth(n - 1)
    // The canvas clips its cards, and the page cannot scroll a card's button into view (the canvas scrolls back), so the press is the button's own click.
    const press = (n: number, name: string | RegExp) => card(n).getByRole('button', { name, exact: true }).evaluate((el) => (el as HTMLElement).click())
    await expect(page.locator('.react-flow__node')).toHaveCount(5)
    // The flow says where the run stands: the plan, the build and the check are done, and the audit waits for the person to press Run.
    await expect(card(1)).toContainText('done')
    await expect(card(2)).toContainText('done')
    await expect(card(3)).toContainText('done')
    await expect(card(4)).toContainText('press Run')
    await expect(card(5)).toContainText('later')
    await expect(card(5).getByRole('button')).toHaveCount(0)

    // Run audit on the card asks the reviewer; its findings are the person's to look at, and then the pull request waits for Run.
    // (A real pointer click at the button, to show the pointer reaches it through the canvas.)
    const at = (await card(4).getByRole('button', { name: 'Run audit' }).boundingBox())!
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
    await expect(card(4)).toContainText('findings to look at', { timeout: 20_000 })
    await page.evaluate((id) => window.aw.finishSeen(id, [0]), ada!.id)
    await expect(card(4)).toContainText('done', { timeout: 20_000 })
    await expect(card(5)).toContainText('needs you')
    await expect(card(5).getByRole('button', { name: 'Run', exact: true })).toBeVisible()

    // The pull request's Run is in the chat too.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const pr = page.getByRole('region', { name: 'Step from ada' })
    await expect(pr).toContainText('nothing is pushed until you press Run')
    await pr.getByRole('button', { name: 'Run', exact: true }).click()
    await page.getByRole('tab', { name: 'Workflow' }).click()
    await expect(card(5)).toContainText('ready to push', { timeout: 15_000 })
    await expect(card(5).getByRole('button')).toHaveCount(0)

    // The rail is still there, as the other way to look at the same steps.
    await page.getByRole('button', { name: 'Rail' }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(0)
    await expect(page.getByRole('region', { name: /where ada is/ })).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('an optional step is skipped from its card and the run goes on; a check that asks for your approval waits for it in the chat after it has passed', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-runflow2-')))
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
  const flow = {
    id: 'opt',
    name: 'Optional',
    steps: [
      { id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' },
      { id: 'build', kind: 'work', name: 'Build' },
      { id: 'polish', kind: 'work', name: 'Polish', optional: true, brief: 'Tidy the names, if there is time.' },
      { id: 'tests', kind: 'check', name: 'Tests', run: 'test -f toggle.ts', gate: 'approve' }
    ]
  }
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const t = Date.now()
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add toggle')
    appendFileSync(join(home, 'runs.jsonl'), [
      { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a toggle', workflow: flow },
      { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a toggle.', assumptions: [], outOfScope: [], questions: [] } },
      { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' },
      { k: 'commit', t: t - 2000, run: 'r1', round: 1, sha: git(ada!.cwd, 'rev-parse', 'HEAD'), subject: 'add toggle' },
      { k: 'step', t: t - 1000, run: 'r1', round: 1, step: 'build', state: 'done' }
    ].map((e) => JSON.stringify(e)).join('\n') + '\n')
    await page.reload()
    await page.getByRole('tab', { name: 'Workflow' }).click()
    const card = (n: number) => page.locator('.react-flow__node').nth(n - 1)
    const press = (n: number, name: string) => card(n).getByRole('button', { name, exact: true }).evaluate((el) => (el as HTMLElement).click())
    // The optional build step is the agent's; the person may skip it from its card, and the check after it goes on.
    await expect(card(3)).toContainText('optional')
    await expect(card(3)).toContainText('working')
    await press(3, 'Skip')
    await expect(card(3)).toContainText('not asked')
    await expect(card(4)).toContainText('working')

    // The check runs; it passed, so it waits for the person, and the approval is in the chat.
    await page.evaluate(() => window.aw.workflows.runCheck('r1', 'tests'))
    await expect(card(4)).toContainText('needs you', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const gate = page.getByRole('region', { name: 'Step from ada' })
    await expect(gate).toContainText('Tests')
    await gate.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByRole('tab', { name: 'Workflow' }).click()
    await expect(card(4)).toContainText('done', { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('a plan that starts when you press Run waits for it, in the chat and on its card; pressing Run tells the agent to begin', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-runflow3-')))
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
  const flow = { id: 'gen', name: 'Generate', steps: [{ id: 'plan', kind: 'plan', name: 'Generate plan', gate: 'approve', start: 'run' }, { id: 'build', kind: 'work', name: 'Build' }] }
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    appendFileSync(join(home, 'runs.jsonl'), JSON.stringify({ k: 'begin', t: Date.now() - 2000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a toggle', workflow: flow }) + '\n')
    await page.reload()

    // The chat holds the press: the agent is told to wait, and nothing has started.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const gate = page.getByRole('region', { name: 'Run Generate plan for ada' })
    await expect(gate).toContainText('edits nothing before that')
    await page.getByRole('tab', { name: 'Workflow' }).click()
    const card = page.locator('.react-flow__node').first()
    await expect(card).toContainText('press Run')
    await expect(card).toContainText('starts when you press Run')

    // Run on the card begins it: the card says it is working, and the chat's card is gone.
    await card.getByRole('button', { name: 'Run', exact: true }).evaluate((el) => (el as HTMLElement).click())
    await expect(card).toContainText('working', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByRole('region', { name: 'Run Generate plan for ada' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
