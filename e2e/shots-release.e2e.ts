// One picture for each new feature of a release, for the release notes: docs/images/releases/<version>/<feature>.png.
// Not part of the normal run: AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts (after pnpm build). Set VERSION and the features to the release's own;
// RELEASING.md says how the notes point at the pictures. Each picture shows the feature and little else, so it reads small in a release.
import { expect, test } from '@playwright/test'
import { SHOTS_ON, exists, hireNamed, officeTools, seedTokens, setWindow, shoot, shootElement, shotApp } from './shotsKit'

const VERSION = '0.6.0'
const at = (name: string) => `releases/${VERSION}/${name}`

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1')
test.describe.configure({ mode: 'serial' })

/** The right-hand panel of a 1400 pixel window, from `y` down `height`: the chat and what is over it, without the office. */
const panel = (y: number, height: number) => ({ x: 868, y, width: 532, height })

test('notes: the window that stays on top', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    const opened = o.app.waitForEvent('window')
    await o.page.locator('header').getByRole('button', { name: 'Notes', exact: true }).click()
    const pad = await opened
    await setWindow(pad, { width: 760, height: 520 })
    await expect(pad.getByRole('application', { name: 'Notes' })).toBeVisible()
    await pad.getByRole('textbox', { name: 'Note' }).click()
    await pad.keyboard.insertText('# Release 0.6.0\n\nThings to settle before the tag goes out.\n\n- [ ] Retake the screenshots\n  - [x] The office and the chat\n  - [ ] The Tokens tab\n- [ ] Ask ada about the release notes\n\n> The notes carry a picture for each new feature.')
    await expect(pad.locator('.nt-box')).toHaveCount(4)
    await pad.locator('.nt-item', { hasText: 'Retake the screenshots' }).hover()
    await pad.locator('.nt-item', { hasText: 'Retake the screenshots' }).getByRole('button', { name: 'Line actions' }).click()
    await pad.getByRole('menuitem', { name: /→ Task/ }).click()
    await expect(pad.locator('.nt-linked')).toHaveCount(3)
    await pad.getByRole('textbox', { name: 'Note' }).click()
    await pad.keyboard.press('ControlOrMeta+End')
    await pad.waitForTimeout(700)
    await shoot(pad, at('notes'))
  } finally {
    await o.shutdown()
  }
})

test('todos: subtasks as a checklist, and labels', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 760, height: 560 } })
  try {
    await hireNamed(o.page, 'ada')
    await expect.poll(() => exists(o.argsLog)).toBe(true)
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.listAgents())).length).toBe(1)
    const tools = await officeTools(o.argsLog)
    await tools.call('todo_add', { title: 'Diagrams in chat', list: 'Chat', labels: ['feature'] })
    await tools.call('todo_add', { title: 'Pick boxes to ask about', parent: '1', labels: ['chat'] })
    await tools.call('todo_add', { title: 'Zoom and draw on the large view', parent: '1', labels: ['chat', 'design'] })
    await tools.call('todo_add', { title: 'Sequence diagrams', parent: '1' })
    await tools.call('todo_add', { title: 'Write the guide page', list: 'Chat', labels: ['docs'] })
    await tools.call('todo_done', { id: '2', note: 'Done.' })
    await o.page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = o.page.getByRole('dialog', { name: 'Todos' })
    await expect(board.getByLabel('Subtasks of Diagrams in chat')).toContainText('1 of 3 done')
    await o.page.waitForTimeout(800)
    await shootElement(board, at('subtasks-labels'))
    await tools.close()
  } finally {
    await o.shutdown()
  }
})

test('usage: the Tokens tab', async () => {
  const o = await shotApp({ prefs: { accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }, size: { width: 1400, height: 640 }, seed: seedTokens })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const usage = o.page.getByRole('dialog', { name: 'Usage and estimated costs' })
    await usage.getByRole('tab', { name: 'Tokens' }).click()
    await expect(usage.locator('.st-tokens tbody tr').first()).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(usage, at('tokens'))
  } finally {
    await o.shutdown()
  }
})

test('office: the agent number and the list mark who needs you', async () => {
  const o = await shotApp({ scenes: { gus: 'permission', di: 'thinking', ada: 'idle', bo: 'idle' } })
  try {
    for (const name of ['ada', 'gus', 'di', 'bo']) await hireNamed(o.page, name)
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.page.locator('.hc-switch').hover()
    const list = o.page.getByRole('menu', { name: 'Agents' })
    await expect(list.getByRole('menuitem', { name: /gus/ }).locator('.wt-mark.need')).toBeVisible({ timeout: 30_000 })
    await o.page.waitForTimeout(700)
    await shoot(o.page, at('agent-marks'), panel(0, 560))
  } finally {
    await o.shutdown()
  }
})

test('chat: a /btw side question in its own card', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const box = o.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add a health check to the shop')
    await box.press('Enter')
    await expect(o.page.getByRole('log', { name: 'Conversation with ada' })).toContainText('Done. I changed', { timeout: 30_000 })
    await box.fill('/btw what is 2+2?')
    await box.press('Enter')
    await expect(o.page.getByRole('region', { name: 'Side question' })).toContainText('It is 4.', { timeout: 25_000 })
    await o.page.waitForTimeout(700)
    await shoot(o.page, at('btw'), panel(475, 425))
  } finally {
    await o.shutdown()
  }
})
