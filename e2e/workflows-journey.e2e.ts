import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire } from './launch'
import { PLAN, envLines, gitAs, gitIn, hireAgy, mcpAs, openWorkflows, runEvents, shot, start, world } from './wf-helpers'

/** A task from its first word to Land, for an agent of each program: the same rules, enforced the same way. */
const JOURNEY = {
  version: 1,
  id: 'journey',
  name: 'Journey',
  when: 'Anything, for the walkthrough.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change and commit it.' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'test -f ok.txt', gate: 'pass', retries: 2 },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge', gate: 'approve' }
  ]
}
const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'toggle.ts', text: 'Adds a file the plan did not mention.' }] })

for (const program of ['claude', 'agy'] as const) {
  test(`a ${program} agent's task from begin to Land: a held commit, the plan, a failing check sent back and fixed, the audit, and landing`, async () => {
    const w = world(`walk-journey-${program}`, { env: { FAKE_AUDIT: FINDINGS } })
    try {
      mkdirSync(join(w.repo, '.agent-world', 'workflows'), { recursive: true })
      writeFileSync(join(w.repo, '.agent-world', 'workflows', 'journey.json'), JSON.stringify(JOURNEY))
      // Landing wants the project's own checkout clean, as it is in real use.
      gitIn(w.repo, 'add', '-A')
      gitIn(w.repo, 'commit', '-qm', 'the workflow')
      const prefs = JSON.parse(readFileSync(join(w.home, 'preferences.json'), 'utf8'))
      prefs.workflows.defaults = { [w.repo]: 'journey' }
      writeFileSync(join(w.home, 'preferences.json'), JSON.stringify(prefs))
      const s = await start(w)
      if (program === 'claude') await hire(s.page, { name: 'ada' })
      else await hireAgy(s.page, 'ada')
      const [ada] = await s.page.evaluate(() => window.aw.listAgents())
      await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
      const env = envLines(w)[0]!
      const { client, call } = await mcpAs(env)
      const git = gitAs(env)

      // The task begins with the workflow's steps; the plan comes first.
      const begun = await call('task_begin', { title: 'Add a toggle' })
      expect(begun.text).toContain('Workflow: Journey')
      expect(begun.text).toContain('build "Build"')
      expect(begun.text).toContain('Before changing anything, write your plan')

      // A commit made before the plan is approved is held, with or without skipping hooks.
      writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
      await git(ada!.cwd, 'add', '-A')
      expect((await git(ada!.cwd, 'commit', '-qm', 'add toggle')).out).toContain('this commit is held')
      expect((await git(ada!.cwd, 'commit', '--no-verify', '-qm', 'add toggle')).out).toContain('this change to a branch is held')
      await git(ada!.cwd, 'reset', '-q')
      mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
      writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), PLAN)
      expect((await call('plan_submit')).text).toContain('Plan handed in')
      await shot(s.page, `journey-${program}-1-plan-waiting`)

      // The person approves; the commit goes through.
      const runId = await s.page.evaluate(() => window.aw.workflows.summary().then((x) => x.runs[0]!.id))
      await s.page.evaluate((id) => window.aw.workflows.decide(id, 'approved'), runId)
      await git(ada!.cwd, 'add', '-A')
      expect((await git(ada!.cwd, 'commit', '-qm', 'add toggle')).ok).toBe(true)

      // The agent reports its work; the project's check waits for the person to approve its command, runs, fails, and the agent is told.
      expect((await call('step_done', { step: 'build' })).text).toContain('reported done')
      // Real agents say the task is done right after reporting their work, before the check has run.
      await call('task_done', { summary: 'Added the toggle.' })
      await expect.poll(async () => (await s.page.evaluate(() => window.aw.workflows.summary())).unapproved, { timeout: 15_000 }).toContain(runId)
      await s.page.evaluate((id) => window.aw.workflows.approveChecks(id), runId)
      await expect.poll(() => runEvents(w).filter((e) => e.k === 'check' && e.ok === false).length, { timeout: 20_000 }).toBe(1)
      // The failure opens the finished task again, so the fix can be reported.
      expect((await s.page.evaluate(() => window.aw.workflows.summary())).runs[0]!.status).toBe('open')
      await shot(s.page, `journey-${program}-2-check-failed`)

      // The fix, committed and reported again: the check passes.
      writeFileSync(join(ada!.cwd, 'ok.txt'), 'ok\n')
      await git(ada!.cwd, 'add', '-A')
      expect((await git(ada!.cwd, 'commit', '-qm', 'make the check pass')).ok).toBe(true)
      // The agent names the step again, as its brief taught it to: that reports the fix.
      expect((await call('step_done', { step: 'build' })).error).toBe(false)
      await expect.poll(() => runEvents(w).filter((e) => e.k === 'check' && e.ok === true).length, { timeout: 20_000 }).toBe(1)
      await call('task_done', { summary: 'Added the toggle, and the check passes.' })

      // Nobody opened anything: with the check passed the app started the audit itself.
      await expect.poll(() => runEvents(w).some((e) => e.k === 'audit' && e.state === 'done'), { timeout: 20_000 }).toBe(true)

      // Finish shows what holds Land and what does not, and Land is the person's.
      await chatTab(s.page)
      const dialog = s.page.getByRole('region', { name: "Finish ada's work" })
      await expect(dialog).toContainText('Plan approved')
      await expect(dialog.getByRole('list', { name: 'What the audit found' })).toContainText('Adds a file the plan did not mention', { timeout: 20_000 })
      await expect(dialog).toContainText('Tests pass: test -f ok.txt passed')
      await expect(dialog.getByRole('button', { name: 'Land anyway on main' })).toBeVisible()
      await shot(s.page, `journey-${program}-3-finish`)
      // The findings are the person's to see: the agent's row says so, as it does for a permission, and then says Land is.
      await expect(s.page.locator('.roster .ask-pill')).toHaveText('audit')
      await dialog.getByRole('checkbox', { name: 'Seen, fine' }).click()
      await expect(dialog.getByRole('checkbox', { name: 'Seen, fine' })).toBeChecked()
      await expect(s.page.locator('.roster .ask-pill')).toHaveText('land')
      await shot(s.page, `journey-${program}-3b-land`)
      await dialog.getByRole('button', { name: 'Land on main' }).click()
      await expect(dialog).toBeHidden({ timeout: 20_000 })
      expect(gitIn(w.repo, 'log', '--format=%s', 'main').split('\n')).toEqual(expect.arrayContaining(['add toggle', 'make the check pass']))
      const audited = JSON.parse(readFileSync(w.env.FAKE_AUDIT_LOG!, 'utf8').trim().split('\n')[0]!) as string | { model: string; prompt: string }
      if (program === 'agy') expect((audited as { model: string }).model).toBe('gemini-3.8-flash-low')
      else expect(audited as string).toContain('Add a toggle.')
      const landed = runEvents(w).find((e) => e.k === 'merge')
      expect(landed).toMatchObject({ how: 'checked' })
      const win = await openWorkflows(s.page, 'Runs')
      await expect(win).toContainText('Add a toggle')
      await shot(s.page, `journey-${program}-4-runs`)
      await client.close()
      await s.shutdown()
    } finally {
      rmSync(w.tmp, { recursive: true, force: true })
    }
  })
}

test('two agents of different programs in one project are held and let go separately: approving one plan frees that agent\'s commits and no other\'s', async () => {
  const w = world('walk-two')
  try {
    const s = await start(w)
    await hire(s.page, { name: 'ada' })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    await hireAgy(s.page, 'bo')
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(2)
    const agents = await s.page.evaluate(() => window.aw.listAgents())
    const [ada, bo] = [agents.find((a) => a.name === 'ada')!, agents.find((a) => a.name === 'bo')!]
    const [e1, e2] = envLines(w)
    const adaMcp = await mcpAs(e1!)
    const boMcp = await mcpAs(e2!)
    await adaMcp.call('task_begin', { title: 'Task of ada' })
    await boMcp.call('task_begin', { title: 'Task of bo' })
    const adaGit = gitAs(e1!)
    const boGit = gitAs(e2!)
    for (const [a, name] of [[ada, 'a.ts'], [bo, 'b.ts']] as const) {
      writeFileSync(join(a.cwd, name), 'x\n')
      gitIn(a.cwd, 'add', '-A')
    }
    expect((await adaGit(ada.cwd, 'commit', '-qm', 'ada work')).out).toContain('held')
    expect((await boGit(bo.cwd, 'commit', '-qm', 'bo work')).out).toContain('held')
    for (const [a, mcp] of [[ada, adaMcp], [bo, boMcp]] as const) {
      mkdirSync(join(a.cwd, '.agent-world'), { recursive: true })
      writeFileSync(join(a.cwd, '.agent-world', 'plan.md'), PLAN)
      await mcp.call('plan_submit')
    }
    const win = await openWorkflows(s.page, 'Runs')
    await expect(win.getByRole('table', { name: 'Runs' }).locator('.rb-grp')).toHaveText([/Needs you.*2/])
    await expect(win.getByRole('table', { name: 'Runs' })).toContainText('ada · Task of ada')
    await expect(win.getByRole('table', { name: 'Runs' })).toContainText('bo · Task of bo')
    await shot(s.page, 'two-1-both-waiting')
    // Only ada's plan is approved.
    const runs = (await s.page.evaluate(() => window.aw.workflows.summary())).runs
    await s.page.evaluate((id) => window.aw.workflows.decide(id, 'approved'), runs.find((r) => r.name === 'ada')!.id)
    expect((await adaGit(ada.cwd, 'commit', '-qm', 'ada work')).ok).toBe(true)
    expect((await boGit(bo.cwd, 'commit', '-qm', 'bo work')).out).toContain('waiting for the person to approve')
    await shot(s.page, 'two-2-one-approved')
    await s.page.evaluate((id) => window.aw.workflows.decide(id, 'approved'), runs.find((r) => r.name === 'bo')!.id)
    expect((await boGit(bo.cwd, 'commit', '-qm', 'bo work')).ok).toBe(true)
    await adaMcp.client.close()
    await boMcp.client.close()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('an agent working in the project folder itself is held too, at the commit and at the branch it is on, even with --no-verify', async () => {
  const w = world('walk-inplace')
  try {
    const s = await start(w)
    const made = await s.page.evaluate((repo) => window.aw.addAgent(repo, { inPlace: true }, 'ina'), w.repo)
    expect(made).toMatchObject({ name: 'ina', cwd: w.repo, branch: null })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const env = envLines(w)[0]!
    const { client, call } = await mcpAs(env)
    const git = gitAs(env)
    await call('task_begin', { title: 'Work in place' })
    writeFileSync(join(w.repo, 'a.ts'), 'x\n')
    await git(w.repo, 'add', '-A')
    expect((await git(w.repo, 'commit', '-qm', 'in place')).out).toContain('this commit is held')
    expect((await git(w.repo, 'commit', '--no-verify', '-qm', 'in place')).out).toContain('this change to a branch is held')
    expect(gitIn(w.repo, 'log', '--format=%s', '-1')).toBe('init')
    await client.close()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('at max an agy agent\'s plan is read against its request by agy: the question arrives with the plan marked as the check\'s, with agy\'s model and tokens', async () => {
  const GAPS = JSON.stringify({ gaps: [{ question: 'Should the toggle follow the operating system setting?', options: ['Follow the system', 'Always manual'] }] })
  const w = world('walk-intent-agy', { dial: 'max', env: { FAKE_AUDIT: GAPS } })
  try {
    const s = await start(w)
    await hireAgy(s.page, 'ada')
    const [ada] = await s.page.evaluate(() => window.aw.listAgents())
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    const box = s.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add dark mode to the app')
    await box.press('Enter')
    // The app reads the request from the conversation file, which agy writes a moment after it is typed.
    await expect.poll(async () => JSON.stringify((await s.page.evaluate((id) => window.aw.chatGet(id), ada!.id)).items), { timeout: 30_000 }).toContain('add dark mode to the app')
    const { client, call } = await mcpAs(envLines(w)[0]!)
    await call('task_begin', { title: 'Add a dark-mode toggle' })
    mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), PLAN)
    expect((await call('plan_submit')).text).toContain('1 open question')
    const asked = JSON.parse(readFileSync(w.env.FAKE_AUDIT_LOG!, 'utf8').trim().split('\n')[0]!) as { prompt: string; model: string }
    expect(asked.model).toBe('gemini-3.8-flash-high')
    expect(asked.prompt).toContain('add dark mode to the app')
    const panel = s.page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Should the toggle follow the operating system setting?', { timeout: 20_000 })
    await expect(panel).toContainText('From check')
    await expect(panel).toContainText('The intent check added 1 question · gemini-3.8-flash-high · about 17k tokens')
    await shot(s.page, 'agy-intent-1-plan')
    await client.close()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
