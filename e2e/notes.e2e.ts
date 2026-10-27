import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('notes: a window of Markdown notes that are kept apart, whose checklist lines become tasks and subtasks and can be asked of an agent', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-notes-e2e-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)

    // The Notes button shows a window of its own.
    const opened = app.waitForEvent('window')
    await page.locator('header').getByRole('button', { name: 'Notes', exact: true }).click()
    const pad = await opened
    await expect(pad.getByRole('application', { name: 'Notes' })).toBeVisible()
    const editor = pad.getByRole('textbox', { name: 'Note' })

    // An empty note says where to start, and each button says what it does when pointed at.
    await expect(pad.locator('.cm-placeholder')).toContainText('Start typing')
    await pad.getByRole('button', { name: 'Keep on top' }).or(pad.getByRole('button', { name: 'Stop keeping on top' })).hover()
    if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-empty.png` })
    await expect(pad.getByRole('button', { name: 'New note' })).toHaveAttribute('data-tip', /Start a new note/)
    // Whichever button is pointed at, its description is wholly inside the window.
    for (const name of ['Notes', 'Keep on top', 'Stop keeping on top', 'Preview', 'New note']) {
      const b = pad.getByRole('button', { name, exact: true })
      if (!(await b.count())) continue
      await b.hover()
      if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-tip-${name.replace(/ /g, '')}.png` })
      const tip = await b.evaluate((el) => {
        // The tip is drawn by the button's ::after, so its size is read from a copy of it.
        const r = el.ownerDocument.createElement('div')
        const cs = getComputedStyle(el, '::after')
        const bar = el.closest('.nt-bar')!.getBoundingClientRect()
        r.style.cssText = `position:fixed;visibility:hidden;width:${cs.width};height:${cs.height}`
        return { right: bar.right - parseFloat(cs.right), width: parseFloat(cs.width), barLeft: bar.left, barRight: bar.right, left: cs.left }
      })
      expect(tip.width).toBeGreaterThan(0)
      expect(tip.right - tip.width).toBeGreaterThanOrEqual(tip.barLeft - 1)
    }
    // Markdown is written in it, with a checklist drawn as boxes.
    await editor.click()
    await pad.keyboard.insertText('# Plan\n- [ ] Umbrella\n  - [ ] Part a\n  - [ ] Part b\nplain words')
    await expect(pad.locator('.nt-box')).toHaveCount(3)
    await expect(pad.locator('.nt-title')).toHaveText('Plan')
    await pad.locator('.nt-box').first().click()
    await expect(pad.locator('.nt-box.on')).toHaveCount(1)
    await pad.locator('.nt-box').first().click()

    // A line made a task takes its parts with it as subtasks, and is marked with its number.
    await pad.locator('.nt-item', { hasText: 'Umbrella' }).hover()
    await pad.locator('.nt-item', { hasText: 'Umbrella' }).getByRole('button', { name: '→ Task' }).click()
    await expect(pad.locator('.nt-linked')).toHaveCount(3)
    await expect(pad.locator('.nt-item', { hasText: 'Umbrella' })).toContainText('(todo#1)')
    await page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    await expect(board.getByLabel('Subtasks of Umbrella')).toContainText('0 of 2 done')
    await board.getByRole('button', { name: /^Close/ }).first().click()

    await pad.locator('.nt-item', { hasText: 'Part a' }).hover()
    // The line's buttons are drawn over its right end, not among its words: the line does not grow when they show.
    const partB = pad.locator('.nt-item', { hasText: 'Part b' })
    await pad.locator('.nt-title').hover()
    const before = (await partB.boundingBox())!.y
    await pad.locator('.nt-item', { hasText: 'Part a' }).hover()
    expect((await partB.boundingBox())!.y).toBe(before)
    if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-hover.png` })
    // Make tasks… shows what it would make, and a line that is a task already is not made again.
    await editor.click()
    await pad.keyboard.press('Control+End')
    await pad.keyboard.insertText('\n- [ ] Later thing')
    await pad.getByRole('button', { name: 'Make tasks…' }).click()
    const make = pad.getByRole('dialog', { name: 'Make tasks from this note' })
    await expect(make).toContainText('Later thing')
    // The panel is beside the note, not on it: the window was made wider, and the two do not overlap.
    const boxes = async () => ({ main: (await pad.locator('.nt-main').boundingBox())!, side: (await pad.locator('.nt-side').boundingBox())! })
    const b = await boxes()
    expect(b.side.x >= b.main.x + b.main.width - 1 || b.main.x >= b.side.x + b.side.width - 1).toBe(true)
    await expect(make).not.toContainText('Umbrella')
    if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-make.png` })
    await make.getByLabel('Give to').selectOption({ label: 'ada · Claude' })
    await make.getByRole('button', { name: 'Make 1 task' }).click()
    await expect(make).toHaveCount(0)
    await expect(pad.locator('.nt-side')).toHaveCount(0)
    await expect(pad.locator('.nt-item', { hasText: 'Later thing' })).toContainText('(todo#4)')
    // A line that is a task has Ask agent only, and asking about it sends that task, as the chat shows.
    await pad.locator('.nt-item', { hasText: 'Part b' }).hover()
    await expect(pad.locator('.nt-item', { hasText: 'Part b' }).getByRole('button', { name: '→ Task' })).toHaveCount(0)
    await pad.locator('.nt-item', { hasText: 'Part b' }).getByRole('button', { name: 'Ask agent' }).click()
    const askBox = pad.getByRole('dialog', { name: 'Ask an agent' })
    await askBox.getByLabel('What to say').fill('Start with the tests.')
    await askBox.getByRole('button', { name: 'Send' }).click()
    await expect(askBox).toHaveCount(0)
    // Giving it to the agent put a message about it in that agent's chat.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.user').filter({ hasText: 'todo#4' })).toHaveCount(1)
    await expect(log.locator('.msg.user').filter({ hasText: 'Start with the tests.' })).toContainText('todo#3')

    // Another note is kept apart: it is empty, the first is as it was, and each can be opened and deleted.
    await pad.getByRole('button', { name: 'New note' }).click()
    await expect(pad.locator('.nt-title')).toHaveText('New note')
    await expect(pad.locator('.nt-box')).toHaveCount(0)
    await editor.click()
    await pad.keyboard.insertText('Second note')
    // The Markdown is drawn where the cursor is not: a line of dashes is a rule and ** is gone from bold words, and where the cursor is the marks show to be edited.
    await pad.keyboard.insertText('\n---\nsome **bold** words')
    await expect(pad.locator('.nt-rule')).toHaveCount(1)
    await expect(pad.locator('.cm-content')).not.toContainText('---')
    await expect(pad.locator('.cm-content')).not.toContainText('**')
    await expect(pad.locator('.nt-b')).toHaveText('bold')
    if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-live.png` })
    await pad.locator('.nt-rule').click()
    await expect(pad.locator('.cm-content')).toContainText('---')
    await expect(pad.locator('.nt-rule')).toHaveCount(0)
    await pad.locator('.cm-line').last().click()
    await pad.keyboard.press('End')
    await expect(pad.locator('.nt-rule')).toHaveCount(1)
    await expect(pad.locator('.cm-content')).not.toContainText('**')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await pad.keyboard.press('ArrowLeft')
    await expect(pad.locator('.cm-content')).toContainText('**bold**')
    await pad.keyboard.press('End')
    // A dropdown has room for its arrow: as much on the right as the words have on the left.
    expect(await pad.getByLabel('Project').evaluate((el) => parseFloat(getComputedStyle(el).paddingRight))).toBeGreaterThanOrEqual(24)
    await pad.getByRole('button', { name: 'Notes', exact: true }).click()
    const list = pad.getByRole('menu', { name: 'Notes of this project' })
    await expect(list.getByRole('menuitem')).toHaveText(['Second note', 'Plan'])
    await list.getByRole('menuitem', { name: 'Plan' }).click()
    await expect(pad.locator('.nt-box')).toHaveCount(4)

    // The preview draws the whole Markdown, and its boxes can be ticked.
    await pad.getByRole('button', { name: 'Preview' }).click()
    await expect(pad.locator('.nt-preview h1')).toHaveText('Plan')
    await pad.locator('.nt-preview input[type=checkbox]').first().click()
    await pad.getByRole('button', { name: 'Edit' }).click()
    await expect(pad.locator('.nt-box.on')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
