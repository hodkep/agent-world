import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire } from './launch'
import { BILLING, envLines, gitIn, mcpAs, openWorkflows, shot, start, world } from './wf-helpers'

const BUG_FIX = { version: 1, id: 'bug-fix', name: 'Bug fix', when: 'A known symptom.', steps: [{ id: 'plan', kind: 'plan', gate: 'approve' }, { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'] }, { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass' }, { id: 'land', kind: 'merge' }] }

function withFiles(name: string, o: { dial?: string } = {}) {
  const w = world(name, o)
  mkdirSync(join(w.repo, '.agent-world', 'workflows'), { recursive: true })
  writeFileSync(join(w.repo, '.agent-world', 'workflows', 'bug-fix.json'), JSON.stringify(BUG_FIX, null, 2) + '\n')
  gitIn(w.repo, 'add', '-A')
  gitIn(w.repo, 'commit', '-qm', 'workflows')
  return w
}

/** Nothing in the window reaches past the window: no sideways scrolling inside it, and its edges are on screen (a flow canvas clips what it draws, so what is inside it is not counted). */
const fits = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const d = document.querySelector('dialog[open]') as HTMLElement
    const r = d.getBoundingClientRect()
    const wide = [...d.querySelectorAll<HTMLElement>('*')].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && !e.closest('.react-flow')).map((e) => e.className || e.tagName)
    return { left: r.left, right: r.right, width: window.innerWidth, wide: wide.slice(0, 5) }
  })

test('in a narrow window the Workflows window, its list and the builder still fit and every button can be pressed', async () => {
  const w = withFiles('walk-narrow')
  try {
    const s = await start(w, { width: 640, height: 820 })
    const win = await openWorkflows(s.page)
    await expect(win.getByRole('option', { name: /Bug fix/ })).toBeVisible()
    await win.getByRole('option', { name: /Bug fix/ }).click()
    const box = await fits(s.page)
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(box.width + 1)
    expect(box.wide).toEqual([])
    await shot(s.page, 'narrow-1-list')
    for (const name of ['Edit with the builder', 'More']) await expect(win.getByRole('button', { name })).toBeInViewport()
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const b = await mcpAs(envLines(w)[0]!)
    await b.call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft).toContainText('Billing change')
    await draft.scrollIntoViewIfNeeded()
    for (const name of ['Save to shop', 'Save for everything', 'Discard']) await expect(draft.getByRole('button', { name })).toBeVisible()
    const split = await fits(s.page)
    expect(split.right).toBeLessThanOrEqual(split.width + 1)
    expect(split.wide).toEqual([])
    await shot(s.page, 'narrow-2-builder')
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    await expect(win.getByRole('option', { name: /Billing change/ })).toBeVisible()
    await b.client.close()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('the Workflows window works from the keyboard: the describe box starts the builder with Enter, the list can be walked and chosen, buttons are reached by Tab, and Escape closes it', async () => {
  const w = withFiles('walk-keys')
  try {
    const s = await start(w)
    await s.page.locator('header').getByRole('button', { name: /Workflows/ }).focus()
    await s.page.keyboard.press('Enter')
    const win = s.page.getByRole('dialog', { name: 'Workflows' })
    await expect(win).toBeVisible()
    // The tabs and the list are reached without a mouse.
    await win.getByRole('tab', { name: 'Workflows' }).focus()
    await s.page.keyboard.press('Enter')
    const list = win.getByRole('listbox', { name: 'Workflow list' })
    await expect(win.getByRole('option', { name: /Bug fix/ })).toBeVisible()
    await list.focus()
    await expect(list).toBeFocused()
    await s.page.keyboard.press('ArrowDown')
    await s.page.keyboard.press('ArrowDown')
    await expect(win.getByRole('option', { name: /Bug fix/ })).toHaveAttribute('aria-selected', 'true')
    await shot(s.page, 'keys-1-list')
    // The describe box: type, Enter, and the builder is there.
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Describe it to the builder…' }).click()
    const box = win.getByRole('textbox', { name: 'Describe a workflow' })
    await box.focus()
    await s.page.keyboard.type('Every change to billing needs a review.')
    await s.page.keyboard.press('Tab')
    await expect(win.getByRole('button', { name: 'Start', exact: true })).toBeFocused()
    await s.page.keyboard.press('Shift+Tab')
    await s.page.keyboard.press('Enter')
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect(win.getByRole('log', { name: 'Conversation with builder' })).toContainText('Every change to billing needs a review.', { timeout: 20_000 })
    // Back to the list by keyboard, then Escape closes the window.
    await win.getByRole('button', { name: '← All workflows' }).focus()
    await s.page.keyboard.press('Enter')
    await expect(win.getByRole('listbox', { name: 'Workflow list' })).toBeVisible()
    await s.page.keyboard.press('Escape')
    await expect(win).toBeHidden()
    await s.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})

test('the project\'s default workflow, once chosen, survives a restart and is the one a new task follows', async () => {
  const w = withFiles('walk-default')
  try {
    const first = await start(w)
    const win = await openWorkflows(first.page)
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Make default for shop' }).click()
    await expect(win.getByRole('option', { name: /Bug fix/ })).toContainText('default')
    await shot(first.page, 'default-1-chosen')
    await first.shutdown()
    rmSync(join(w.home, 'running.json'), { force: true })
    expect(JSON.parse(readFileSync(join(w.home, 'preferences.json'), 'utf8')).workflows.defaults).toEqual({ [w.repo]: 'bug-fix' })

    const second = await start(w)
    const again = await openWorkflows(second.page)
    await expect(again.getByRole('option', { name: /Bug fix/ })).toContainText('default')
    await again.getByRole('button', { name: 'Close' }).click()
    await hire(second.page, { name: 'ada' })
    await expect.poll(() => envLines(w).length, { timeout: 20_000 }).toBe(1)
    const { client, call } = await mcpAs(envLines(w)[0]!)
    const begun = await call('task_begin', { title: 'Fix the login' })
    expect(begun.text).toContain('Workflow: Bug fix')
    // This test's library is empty, so the skill the step names is not there.
    expect(begun.text).toContain('there is no skill tdd in the library')
    await client.close()
    await second.shutdown()
  } finally {
    rmSync(w.tmp, { recursive: true, force: true })
  }
})
