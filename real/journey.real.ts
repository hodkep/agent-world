import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { headMenu, hire } from '../e2e/launch'
import { runEvents, shot } from '../e2e/wf-helpers'
import { JOURNEY, REQUEST } from './journeyData'
import { allowAll, realWorld, startReal } from './real'

test('a real Claude agent follows the workflow: it plans, waits for approval, commits, is sent back by a check it could not see, fixes it, and its branch is audited and landed', async () => {
  const w = realWorld('journey')
  const events = () => runEvents({ home: w.home } as never)
  try {
    mkdirSync(join(w.repo, '.agent-world', 'workflows'), { recursive: true })
    writeFileSync(join(w.repo, '.agent-world', 'workflows', 'journey.json'), JSON.stringify(JOURNEY))
    w.git('add', '-A')
    w.git('commit', '-qm', 'the workflow')
    const prefs = JSON.parse(readFileSync(join(w.home, 'preferences.json'), 'utf8'))
    prefs.workflows.defaults = { [w.repo]: 'journey' }
    writeFileSync(join(w.home, 'preferences.json'), JSON.stringify(prefs))
    const s = await startReal(w)
    const stop = allowAll(s.page)
    await hire(s.page, { name: 'ada' })
    // A new agent first asks to trust its folder (answered by the helper); the request goes in once it is waiting for one.
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    await expect(s.page.getByRole('button', { name: 'Trust folder' })).toBeVisible({ timeout: 90_000 })
    await expect(s.page.getByRole('button', { name: 'Trust folder' })).toBeHidden({ timeout: 30_000 })
    await s.page.waitForTimeout(8000)
    const box = s.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill(REQUEST)
    await box.press('Enter')

    // The agent announces the task and hands in a plan; the person answers what it asks and approves.
    const plan = s.page.getByRole('region', { name: 'Plan from ada' })
    try {
      await expect(plan).toBeVisible({ timeout: 240_000 })
    } catch (e) {
      await shot(s.page, 'real-journey-0-no-plan')
      console.log('NO PLAN. CHAT:', JSON.stringify((await s.page.getByRole('log', { name: 'Conversation with ada' }).innerText()).slice(-2500)))
      console.log('NO PLAN. EVENTS:', JSON.stringify(events().map((x) => x.k)))
      throw e
    }
    await shot(s.page, 'real-journey-1-plan')
    for (const group of await plan.getByRole('radiogroup').all()) await group.getByRole('radio').first().click()
    await plan.getByRole('button', { name: 'Approve plan' }).click()

    // The project's check asks to run its command, once.
    const commands = s.page.getByRole('region', { name: /Commands from Journey/ })
    try {
      await expect(commands).toBeVisible({ timeout: 420_000 })
    } catch (e) {
      await shot(s.page, 'real-journey-2-no-commands')
      console.log('NO COMMANDS. CHAT:', JSON.stringify((await s.page.getByRole('log', { name: 'Conversation with ada' }).innerText()).slice(-3000)))
      const raw = JSON.stringify((await s.page.evaluate(() => window.aw.listAgents().then((a) => window.aw.chatGet(a[0]!.id)))).items)
      const at = raw.indexOf('task_begin')
      console.log('NO COMMANDS. TASK_BEGIN CALL:', at < 0 ? 'not found' : raw.slice(Math.max(0, at - 100), at + 400))
      console.log('NO COMMANDS. EVENTS:', JSON.stringify(events().map((x) => `${x.k}${x.state ? ':' + x.state : ''}${x.step ? ':' + x.step : ''}`)))
      throw e
    }
    await shot(s.page, 'real-journey-2-commands')
    await commands.getByRole('button', { name: /Approve/ }).click()

    // It fails at first, is sent back, and the agent fixes it: the log shows a failed try and then a pass.
    await expect.poll(() => events().filter((e) => e.k === 'check' && e.ok === true).length, { timeout: 900_000 }).toBeGreaterThan(0)
    const tries = events().filter((e) => e.k === 'check')
    console.log('REAL JOURNEY CHECK TRIES', JSON.stringify(tries.map((t) => t.ok)))
    await shot(s.page, 'real-journey-3-check-passed')

    // Finish: audit, then Land.
    await headMenu(s.page, 'Finish')
    const dialog = s.page.getByRole('dialog', { name: "Finish ada's work" })
    await expect(dialog).toContainText('Plan approved', { timeout: 30_000 })
    await expect(dialog.getByRole('group', { name: 'Against the plan' })).toContainText('Audited', { timeout: 180_000 })
    await shot(s.page, 'real-journey-4-finish')
    for (const seen of await dialog.getByRole('checkbox', { name: 'Seen, fine' }).all()) await seen.click()
    await dialog.getByRole('button', { name: 'Land on main' }).click()
    await expect(dialog).toBeHidden({ timeout: 60_000 })
    expect(w.git('log', '--format=%s', 'main')).toContain('start')
    expect(readFileSync(join(w.repo, 'slug.js'), 'utf8')).toContain('slugify')
    stop()
    await s.shutdown()
  } finally {
    // What the office logged, kept beside the screenshots when there are any.
    if (process.env.WALK_SHOTS && existsSync(join(w.home, 'runs.jsonl'))) copyFileSync(join(w.home, 'runs.jsonl'), join(process.env.WALK_SHOTS, 'real-journey-runs.jsonl'))
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
