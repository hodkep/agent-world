// One picture for each new feature of a release, for the release notes: docs/images/releases/<version>/<feature>.png.
// Not part of the normal run: AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts (after pnpm build). Set VERSION and the features to the release's own;
// RELEASING.md says how the notes point at the pictures. Each picture shows the feature and little else, so it reads small in a release.
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { SHOTS_ON, hireNamed, shoot, shootElement, shotApp } from './shotsKit'

const VERSION = '0.6.1'
const at = (name: string) => `releases/${VERSION}/${name}`

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1')
test.describe.configure({ mode: 'serial' })

/** The right-hand panel of a 1400 pixel window, from `y` down `height`: the chat and what is over it, without the office. */
const panel = (y: number, height: number) => ({ x: 868, y, width: 532, height })

test('todos: the open task is marked in its list and scrolled to', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 760, height: 560 } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.evaluate(async (f) => {
      await window.aw.todos.add(f, { title: 'Diagrams in chat', list: 'Chat', labels: ['feature'] })
      await window.aw.todos.add(f, { title: 'Write the guide page', list: 'Chat', labels: ['docs'] })
      await window.aw.todos.add(f, { title: 'Retake the screenshots', list: 'Release', labels: ['docs'] })
    }, o.repo)
    await o.page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = o.page.getByRole('dialog', { name: 'Todos' })
    await board.getByRole('button', { name: 'Open Write the guide page' }).click()
    await expect(board.getByRole('complementary', { name: 'Task detail' }).getByLabel('Task title')).toHaveValue('Write the guide page')
    await expect(board.locator('.td-task.sel')).toBeVisible()
    await o.page.mouse.move(0, 0)
    await o.page.waitForTimeout(800)
    await shootElement(board, at('open-card'))
  } finally {
    await o.shutdown()
  }
})

test('chat: the answer you give to a form is a card in its words', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_DELAY_MS: '6000', FAKE_SAY_FILE: resolve(__dirname, 'fixtures/release-form.md') } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const log = o.page.getByRole('log', { name: 'Conversation with ada' })
    // The fake's first words are the form (it speaks the file once, to the opening text); the note about that text is left out of the picture.
    const form = log.locator('.a2ui')
    await expect(form.getByRole('heading', { name: 'Which mark for the open card?' })).toBeVisible({ timeout: 30_000 })
    await o.page.addStyleTag({ content: '.slips { display: none }' })
    await form.getByLabel('B · Gold title').check()
    await form.getByRole('button', { name: 'Build it' }).click()
    const answer = log.locator('.ans')
    await expect(answer).toContainText('B · Gold title')
    await o.page.waitForTimeout(700)
    const top = (await form.boundingBox())!.y - 10
    const a = (await answer.boundingBox())!
    await shoot(o.page, at('form-answer'), panel(top, a.y + a.height + 10 - top))
  } finally {
    await o.shutdown()
  }
})

test('office: an agent that finished while you were elsewhere is marked on its tile', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_DELAY_MS: '600' }, scenes: { bo: 'thinking', di: 'idle' } })
  try {
    for (const name of ['ada', 'bo', 'di']) await hireNamed(o.page, name)
    const ada = (await o.page.evaluate(() => window.aw.listAgents())).find((x) => x.name === 'ada')!
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    // di is on screen; ada works and finishes her turn.
    await o.page.evaluate((id) => window.aw.chatSend(id, 'Say something'), ada.id)
    await expect(o.page.getByTestId('agents-dot')).toHaveClass(/done/, { timeout: 60_000 })
    await o.page.locator('.hc-switch').hover()
    const tile = o.page.getByRole('menu', { name: 'Agents' }).getByRole('menuitem', { name: /ada/ })
    await expect(tile.locator('.wt-tag.done')).toHaveText('Finished')
    await o.page.waitForTimeout(700)
    await shoot(o.page, at('finished-tile'), panel(0, 420))
  } finally {
    await o.shutdown()
  }
})
