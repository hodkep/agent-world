import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { headMenu } from '../e2e/launch'
import { runEvents, shot } from '../e2e/wf-helpers'
import { JOURNEY, REQUEST } from './journeyData'
import { allowAll, realWorld, startReal } from './real'

/**
 * agy as it is: connected through the app's own Connect step (which updates the real `aw-library` plugin to the version with the edit hold,
 * as the person agreed), then a task through the workflow. The entry this adds to agy's list is named for this run's home and removed after.
 */
test('a real agy agent: connected through the app, held while its plan waits, sent back by a check, audited by agy, and landed', async () => {
  const w = realWorld('agy', { defaultProvider: 'agy' })
  const entry = 'agent-world-realagy'
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

    // Connect agy through Settings, as a person would: the plan is shown, then approved.
    await s.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = s.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Message box' }).click()
    const box = settings.getByRole('tabpanel')
    await box.getByRole('button', { name: /Let agy .* message other agents/ }).click()
    const plan0 = box.getByRole('group', { name: /Connect agy/ })
    await expect(plan0).toContainText(entry)
    await shot(s.page, 'real-agy-1-connect-plan')
    await plan0.getByRole('button', { name: 'Connect' }).click()
    await expect(box.getByText('Its agents can message the others')).toBeVisible({ timeout: 90_000 })
    await settings.getByRole('button', { name: 'Close settings' }).click()
    expect(JSON.parse(readFileSync(join(process.env.HOME!, '.gemini', 'config', 'plugins', 'aw-library', 'plugin.json'), 'utf8')).version).toBe('0.1.3')

    // The plugin is installed for every agy session on this machine. One that nobody at the office started must still be able to write a file:
    // before the office has anything to say, the plugin's answer to agy is silence, and agy reads {} there as a denial.
    // The model may decline on its own (this person's global rules make it stop for approval), so a few tries: one write is the proof.
    let wrote = false
    for (let i = 0; i < 4 && !wrote; i++) {
      const plain = mkdtempSync(join(tmpdir(), 'aw-real-plain-'))
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: plain })
      try {
        execFileSync(w.env.AW_AGY_BIN!, ['-p', 'Approved: no plan is needed. Use your file writing tool now to create note.txt containing the word hello, then reply done.', '--dangerously-skip-permissions', '--output-format', 'json', '--model', 'gemini-3.8-flash-low', '--print-timeout', '120s'], { cwd: plain, timeout: 150_000, stdio: 'ignore' })
      } catch {
        /* a run that fails is a try that did not write */
      }
      wrote = existsSync(join(plain, 'note.txt'))
      rmSync(plain, { recursive: true, force: true })
    }
    expect(wrote).toBe(true)

    // Hire agy and give it the task once it is ready.
    await s.page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = s.page.getByRole('form', { name: 'Hire an agent' })
    await form.getByRole('radio', { name: /agy/ }).first().check()
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    await s.page.waitForTimeout(20_000)
    const msg = s.page.getByRole('textbox', { name: 'Message ada' })
    await msg.fill(`${REQUEST} This request is approved: do not stop to ask for approval of your own, because the project's workflow has its own approvals.`)
    await msg.press('Enter')

    const plan = s.page.getByRole('region', { name: 'Plan from ada' })
    try {
      await expect(plan).toBeVisible({ timeout: 900_000 })
    } catch (e) {
      await shot(s.page, 'real-agy-2-no-plan')
      console.log('NO PLAN. CHAT:', JSON.stringify((await s.page.getByRole('log', { name: 'Conversation with ada' }).innerText()).slice(-3000)))
      console.log('NO PLAN. WAITING:', JSON.stringify(await s.page.locator('[aria-label$="is waiting for you"]').allInnerTexts().catch(() => ['none'])), 'BUTTONS:', JSON.stringify(await s.page.getByRole('button').allInnerTexts().then((t) => t.filter((x) => /allow|deny|trust|yes|no/i.test(x))).catch(() => [])))
      console.log('NO PLAN. EVENTS:', JSON.stringify(events().map((x) => `${x.k}${x.state ? ':' + x.state : ''}`)))
      throw e
    }
    const [ada] = await s.page.evaluate(() => window.aw.listAgents())
    // While the plan waits, nothing but the plan may have changed in its work tree.
    const changed = execFileSync('git', ['status', '--porcelain'], { cwd: ada!.cwd, encoding: 'utf8' }).split('\n').filter((l) => l && !l.includes('.agent-world') && !l.includes('excalidraw.log'))
    console.log('REAL AGY CHANGED BEFORE APPROVAL', JSON.stringify(changed))
    expect(changed).toEqual([])
    await shot(s.page, 'real-agy-3-plan')
    for (const group of await plan.getByRole('radiogroup').all()) await group.getByRole('radio').first().click()
    await plan.getByRole('button', { name: 'Approve plan' }).click()

    const commands = s.page.getByRole('region', { name: /Commands from Journey/ })
    try {
      await expect(commands).toBeVisible({ timeout: 900_000 })
    } catch (e) {
      await shot(s.page, 'real-agy-4-no-commands')
      console.log('NO COMMANDS. CHAT:', JSON.stringify((await s.page.getByRole('log', { name: 'Conversation with ada' }).innerText()).slice(-3000)))
      console.log('NO COMMANDS. EVENTS:', JSON.stringify(events().map((x) => `${x.k}${x.state ? ':' + x.state : ''}${x.step ? ':' + x.step : ''}`)))
      throw e
    }
    await commands.getByRole('button', { name: /Approve/ }).click()
    await expect.poll(() => events().filter((e) => e.k === 'check' && e.ok === true).length, { timeout: 1_200_000 }).toBeGreaterThan(0)
    console.log('REAL AGY CHECK TRIES', JSON.stringify(events().filter((e) => e.k === 'check').map((t) => t.ok)))
    await headMenu(s.page, 'Finish')
    const dialog = s.page.getByRole('dialog', { name: "Finish ada's work" })
    await expect(dialog.getByRole('group', { name: 'Against the plan' })).toContainText('Audited', { timeout: 240_000 })
    await shot(s.page, 'real-agy-5-finish')
    for (const seen of await dialog.getByRole('checkbox', { name: 'Seen, fine' }).all()) await seen.click()
    await dialog.getByRole('button', { name: 'Land on main' }).click()
    await expect(dialog).toBeHidden({ timeout: 60_000 })
    expect(readFileSync(join(w.repo, 'slug.js'), 'utf8')).toContain('slugify')
    stop()
    await s.shutdown()
  } finally {
    // The entry this run added to agy's own list goes again; the plugin stays at the new version.
    try {
      execFileSync(w.env.AW_AGY_BIN!, ['mcp', 'remove', entry], { stdio: 'ignore', timeout: 30_000 })
    } catch {
      /* it was never added */
    }
    if (process.env.WALK_SHOTS && existsSync(join(w.home, 'runs.jsonl'))) copyFileSync(join(w.home, 'runs.jsonl'), join(process.env.WALK_SHOTS, 'real-agy-runs.jsonl'))
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
