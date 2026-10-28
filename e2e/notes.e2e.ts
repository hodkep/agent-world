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
    // Its buttons show on hover: Task, Subtask and Ask for a line that is not a task yet.
    const umbrella = pad.locator('.nt-item', { hasText: 'Umbrella' }).locator('.nt-handle')
    await expect(umbrella.getByRole('button')).toHaveText(['Task', 'Sub', 'Ask'])
    if (process.env.SHOT) await pad.screenshot({ path: `${process.env.SHOT}-menu.png` })
    await umbrella.getByRole('button', { name: 'Make a task' }).click()
    await expect(pad.locator('.nt-linked')).toHaveCount(3)
    await expect(pad.locator('.nt-item', { hasText: 'Umbrella' })).toContainText('(todo#1)')
    await page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    await expect(board.getByLabel('Subtasks of Umbrella')).toContainText('0 of 2 done')
    await board.getByRole('button', { name: /^Close/ }).first().click()

    await pad.locator('.nt-item', { hasText: 'Part a' }).hover()
    // The line's handle is in a margin of its own: it is not over any of the words, which can be clicked and edited.
    const partA = pad.locator('.nt-item', { hasText: 'Part a' })
    const handle = partA.locator('.nt-handle')
    // A line that is a task already can only be asked about.
    await expect(handle.getByRole('button')).toHaveText(['Ask'])
    const ask = handle.getByRole('button', { name: 'Ask an agent' })
    const hb = (await handle.boundingBox())!
    const eb = (await partA.boundingBox())!
    expect(hb.x).toBeGreaterThanOrEqual(eb.x + eb.width - 1)
    // Walking the pointer from the words to the handle keeps it there (no gap between them where it would hide), and it can be clicked.
    await pad.mouse.move(eb.x + 20, eb.y + eb.height / 2)
    await pad.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 40 })
    await expect(ask).toBeVisible()
    await pad.mouse.down()
    await pad.mouse.up()
    await expect(pad.getByRole('dialog', { name: 'Ask an agent' })).toBeVisible()
    await pad.getByRole('dialog', { name: 'Ask an agent' }).getByRole('button', { name: 'Cancel' }).click()
    await partA.click({ position: { x: 70, y: 10 } })
    await pad.keyboard.type('!')
    await expect(pad.locator('.cm-content')).toContainText('!')
    await pad.keyboard.press('Backspace')
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
    // A line that is a task has Ask only, and asking about it sends that task, as the chat shows.
    await pad.locator('.nt-item', { hasText: 'Part b' }).hover()
    await expect(pad.locator('.nt-item', { hasText: 'Part b' }).getByRole('button')).toHaveText(['Ask'])
    await pad.locator('.nt-item', { hasText: 'Part b' }).getByRole('button', { name: 'Ask an agent' }).click()
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
    // Enter in a checklist starts the next item with an empty box, a second Enter on the empty item ends the list.
    await pad.keyboard.insertText('- [ ] first item')
    await pad.keyboard.press('Enter')
    await expect(pad.locator('.nt-box')).toHaveCount(2)
    await pad.keyboard.insertText('second item')
    await pad.keyboard.press('Enter')
    await pad.keyboard.press('Enter')
    await expect(pad.locator('.nt-box')).toHaveCount(2)
    await pad.keyboard.press('Control+A')
    await pad.keyboard.press('Meta+A')
    await pad.keyboard.press('Backspace')
    await pad.keyboard.insertText('Second note')
    // The same things from the keyboard (Ctrl, or Cmd on a Mac): Mod+Enter makes the line a task.
    await pad.keyboard.insertText('\n- [ ] by keyboard')
    await pad.keyboard.press('ControlOrMeta+Enter')
    await expect(pad.locator('.nt-item', { hasText: 'by keyboard' })).toContainText('(todo#')
    await pad.keyboard.press('Control+A')
    await pad.keyboard.press('Meta+A')
    await pad.keyboard.press('Backspace')
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
