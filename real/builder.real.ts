import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { parseWorkflow } from '../src/shared/workflow'
import { shot, openWorkflows } from '../e2e/wf-helpers'
import { allowAll, realWorld, startReal } from './real'

test('a real Claude builder: described in a sentence, it asks or proposes, and the proposal is a valid workflow that saves', async () => {
  const w = realWorld('builder')
  try {
    const s = await startReal(w)
    const stop = allowAll(s.page)
    const win = await openWorkflows(s.page)
    await win.getByRole('textbox', { name: 'Describe a workflow' }).fill('Every change to the slug code needs the tests to pass and my own review before it lands.')
    await win.getByRole('button', { name: 'Start with the builder' }).click()
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    const log = win.getByRole('log', { name: 'Conversation with builder' })
    await expect(log).toContainText('Every change to the slug code', { timeout: 120_000 })
    await shot(s.page, 'real-claude-builder-1-started')
    // It may ask a question first: the person answers once, in the chat.
    const asked = await Promise.race([draft.waitFor({ timeout: 240_000 }).then(() => false), win.getByText('Nothing proposed yet').waitFor({ state: 'hidden', timeout: 240_000 }).then(() => false)]).catch(() => true)
    if (asked || !(await draft.isVisible())) {
      const box = win.getByRole('textbox', { name: /Message builder/ })
      await box.fill('Use your best judgement and propose it now.')
      await box.press('Enter')
    }
    await expect(draft).toBeVisible({ timeout: 300_000 })
    await shot(s.page, 'real-claude-builder-2-proposal')
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    await expect(win.getByRole('list', { name: 'Steps' })).toBeVisible({ timeout: 15_000 })
    const dir = join(w.repo, '.agent-world', 'workflows')
    const files = readdirSync(dir)
    expect(files).toHaveLength(1)
    const parsed = parseWorkflow(readFileSync(join(dir, files[0]!), 'utf8'))
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true)
    console.log('REAL BUILDER SAVED', files[0], JSON.stringify(parsed.ok ? parsed.workflow.steps.map((x) => x.kind) : []))
    await shot(s.page, 'real-claude-builder-3-saved')
    stop()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
