import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire } from './launch'
import { BILLING, PLAN, envLines, gitIn, makeRepo, mcpAs, openWorkflows, shot, start, world } from './wf-helpers'

/**
 * The walkthrough: scenarios the focused specs leave out, run on the built app. Set WALK_SHOTS=<folder> to keep a screenshot of each.
 *   WALK_SHOTS=/some/folder npx playwright test e2e/workflows-walkthrough.e2e.ts
 */

test('a restart in the middle of work loses nothing: the plan still waits, the builder is still there, and so is its draft', async () => {
  const w = world('walk-restart')
  try {
    const first = await start(w)
    await hire(first.page, { name: 'ada' })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const ada = await mcpAs(envLines(w)[0]!)
    await ada.call('task_begin', { title: 'Add a toggle' })
    const [agent] = await first.page.evaluate(() => window.aw.listAgents())
    mkdirSync(join(agent!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(agent!.cwd, '.agent-world', 'plan.md'), PLAN)
    await ada.call('plan_submit')
    // The builder proposes a workflow, which the person has not saved.
    const win = await openWorkflows(first.page)
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(2)
    const builder = await mcpAs(envLines(w)[1]!)
    await builder.call('workflow_propose', { file: JSON.stringify(BILLING) })
    await expect(win.getByRole('region', { name: 'Workflow proposal' })).toContainText('Billing change')
    await shot(first.page, 'restart-1-before')
    await ada.client.close()
    await builder.client.close()
    await first.shutdown()
    rmSync(join(w.home, 'running.json'), { force: true })

    const second = await start(w)
    const runs = await openWorkflows(second.page, 'Runs')
    await expect(runs.getByRole('table', { name: 'Runs' }).locator('.rb-grp')).toHaveText([/Needs you.*1/])
    await expect(runs.getByRole('table', { name: 'Runs' })).toContainText('Add a toggle')
    await shot(second.page, 'restart-2-runs-after')
    await runs.getByRole('tab', { name: 'Workflows' }).click()
    await runs.getByRole('button', { name: 'Open the builder' }).click()
    await expect(runs.getByRole('region', { name: 'Workflow proposal' })).toContainText('Billing change', { timeout: 15_000 })
    await shot(second.page, 'restart-3-draft-after')
    const agents = await second.page.evaluate(() => window.aw.listAgents())
    expect(agents.map((a) => a.name).sort()).toEqual(['ada', 'builder'])
    expect(agents.filter((a) => a.builder)).toHaveLength(1)
    // The plan is still the person's to decide, after the restart.
    await second.page.evaluate(() => window.aw.workflows.summary().then((s) => window.aw.workflows.decide(s.runs[0]!.id, 'approved')))
    expect((await second.page.evaluate(() => window.aw.workflows.summary())).runs[0]!.rounds[0]!.plan!.state).toBe('approved')
    await second.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('damaged files are put up with: a half-written log line, a broken drafts file, a broken approvals file and a broken workflow file leave the app working', async () => {
  const w = world('walk-corrupt')
  try {
    const t = Date.now()
    writeFileSync(join(w.home, 'runs.jsonl'), `${JSON.stringify({ k: 'begin', t: t - 5000, run: 'r1', agent: 'gone', name: 'ada', project: w.repo, title: 'An earlier task' })}\nthis is not json\n{"k":"round","t":1,"ru`)
    writeFileSync(join(w.home, 'workflow-proposals.json'), '{{{ nope')
    writeFileSync(join(w.home, 'workflow-approvals.json'), '[1,2,3]')
    mkdirSync(join(w.repo, '.agent-world', 'workflows'), { recursive: true })
    writeFileSync(join(w.repo, '.agent-world', 'workflows', 'broken.json'), '{ "version": 1, ')
    const s = await start(w)
    const runs = await openWorkflows(s.page, 'Runs')
    await expect(runs).toContainText('An earlier task')
    await runs.getByRole('tab', { name: 'Workflows' }).click()
    await runs.getByRole('option', { name: /broken/ }).click()
    await expect(runs.getByRole('list', { name: 'Problems' })).toContainText('Not valid JSON')
    await shot(s.page, 'corrupt-1-list')
    await runs.getByRole('button', { name: 'Open the builder' }).click()
    await expect(runs.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const builder = await mcpAs(envLines(w)[0]!)
    // The builder reads the broken file as a problem, not a crash, and its next proposal works and is saved over the broken drafts file.
    expect((await builder.call('workflow_list')).text).toContain('broken (this project): does not read')
    expect((await builder.call('workflow_get', { id: 'broken' })).text).toContain('does not read')
    await builder.call('workflow_propose', { file: JSON.stringify(BILLING) })
    await expect(runs.getByRole('region', { name: 'Workflow proposal' })).toContainText('Billing change')
    await runs.getByRole('region', { name: 'Workflow proposal' }).getByRole('button', { name: 'Save to shop' }).click()
    await expect(runs.getByRole('option', { name: /Billing change/ })).toHaveAttribute('aria-selected', 'true')
    expect(JSON.parse(readFileSync(join(w.home, 'workflow-approvals.json'), 'utf8')).approved).toBeTruthy()
    await builder.client.close()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('the builder\'s other ways out: save for everything, save as a new workflow, discard, a bad file, closing and reopening the window, and a second project\'s own builder', async () => {
  const w = world('walk-builder')
  try {
    mkdirSync(join(w.repo, '.agent-world', 'workflows'), { recursive: true })
    const saved = { version: 1, id: 'bug-fix', name: 'Bug fix', steps: [{ id: 'fix', kind: 'work', name: 'Fix' }, { id: 'land', kind: 'merge' }] }
    writeFileSync(join(w.repo, '.agent-world', 'workflows', 'bug-fix.json'), JSON.stringify(saved, null, 2) + '\n')
    const s = await start(w)
    let win = await openWorkflows(s.page)
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const b = await mcpAs(envLines(w)[0]!)
    const draft = () => win.getByRole('region', { name: 'Workflow proposal' })

    // A file that is not a workflow is refused to the builder; the person sees nothing.
    expect((await b.call('workflow_propose', { file: '{"version":1}' })).error).toBe(true)
    await expect(win.getByText('Nothing proposed yet')).toBeVisible()

    // Save for everything: the file goes to the app's own folder and the list says so.
    await b.call('workflow_propose', { file: JSON.stringify(BILLING) })
    await draft().getByRole('button', { name: 'Save for everything' }).click()
    await expect(win.getByRole('option', { name: /Billing change/ })).toContainText('Everything')
    expect(existsSync(join(w.home, 'workflows', 'billing-change.json'))).toBe(true)
    expect(existsSync(join(w.repo, '.agent-world', 'workflows', 'billing-change.json'))).toBe(false)
    await shot(s.page, 'builder-1-global')

    // Close the window and open it again: the same builder, still one.
    await win.getByRole('button', { name: 'Close' }).click()
    win = await openWorkflows(s.page)
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    expect((await s.page.evaluate(() => window.aw.listAgents())).filter((a) => a.builder)).toHaveLength(1)

    // Save as a new workflow: a copy beside the saved one, named so.
    await b.call('workflow_propose', { file: JSON.stringify({ ...saved, name: 'Bug fix, stricter' }) })
    await draft().getByRole('button', { name: 'Save as a new workflow' }).click()
    await expect(win.getByRole('option', { name: /Bug fix, stricter \(2\)/ })).toBeVisible()
    expect(readdirSync(join(w.repo, '.agent-world', 'workflows')).sort()).toEqual(['bug-fix-2.json', 'bug-fix.json'])

    // Discard: the draft goes and nothing is written.
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await b.call('workflow_propose', { file: JSON.stringify({ ...saved, id: 'throwaway', name: 'Throwaway' }) })
    await draft().getByRole('button', { name: 'Discard' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible()
    expect(existsSync(join(w.repo, '.agent-world', 'workflows', 'throwaway.json'))).toBe(false)
    await b.client.close()

    // A second project gets a builder of its own.
    const other = makeRepo(w.tmp, 'blog')
    await s.page.evaluate((f) => window.aw.activateWorkspace(f), other)
    await s.page.reload()
    win = await openWorkflows(s.page)
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const builders = (await s.page.evaluate(() => window.aw.listAgents())).filter((a) => a.builder)
    expect(builders.map((a) => a.name).sort()).toEqual(['builder', 'builder-2'])
    expect(new Set(builders.map((a) => a.repoPath)).size).toBe(2)
    await shot(s.page, 'builder-2-second-project')
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
void gitIn
