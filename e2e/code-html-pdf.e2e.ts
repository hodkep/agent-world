import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// A one-page PDF with the words "Q3 report", with a proper cross-reference table so any viewer draws it.
const pdf = () => {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '<</Length 43>>\nstream\nBT /F1 24 Tf 20 100 Td (Q3 report) Tj ET\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ]
  let out = '%PDF-1.4\n'
  const at: number[] = []
  objs.forEach((o, i) => {
    at.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Root 1 0 R/Size ${objs.length + 1}>>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const PDF = pdf()

test('an .html file in the Code tab can be read as a page, as markdown can, and a .pdf shows as a PDF that cannot be changed', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-htmlpdf-'))
  const repo = join(tmp, 'site')
  mkdirSync(repo, { recursive: true })
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(repo, 'report.html'), '<!doctype html><link rel="stylesheet" href="report.css"><h1>Q3 report</h1><p id="p">Revenue grew.</p>\n')
  writeFileSync(join(repo, 'report.css'), '#p { color: rgb(255, 0, 0) }\n')
  writeFileSync(join(repo, 'q3.pdf'), PDF)
  git('add', '.')
  git('commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('tab', { name: 'Files', exact: true }).click()
    const tree = page.locator('.change-list .tree')

    // HTML: source first, a Preview button as for markdown; the page comes with its own stylesheet; Source goes back.
    await tree.getByRole('button', { name: /report\.html/ }).click()
    await expect(page.locator('.diff')).toContainText('stylesheet')
    await page.locator('.fcrumb').getByRole('button', { name: 'Preview' }).click()
    const frame = page.frameLocator('iframe[title="Preview of report.html"]')
    await expect(frame.getByRole('heading', { name: 'Q3 report' })).toBeVisible({ timeout: 15_000 })
    await expect(frame.locator('#p')).toHaveCSS('color', 'rgb(255, 0, 0)')
    await page.locator('.fcrumb').getByRole('button', { name: 'Source' }).click()
    await expect(page.locator('iframe[title="Preview of report.html"]')).toHaveCount(0)

    // PDF: shown in a frame, no Save, an offer to open it in the Preview tab, and the file is as it was.
    await tree.getByRole('button', { name: /q3\.pdf/ }).click()
    await expect(page.locator('webview[title="q3.pdf"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.fcrumb').getByRole('button', { name: /^Save/ })).toHaveCount(0)
    await expect(page.locator('.fcrumb').getByRole('button', { name: 'Open in Preview' })).toBeVisible()
    expect(readFileSync(join(repo, 'q3.pdf')).equals(PDF)).toBe(true)
    await page.locator('.fcrumb').getByRole('button', { name: 'Open in Preview' }).click()
    await expect(page.getByRole('tab', { name: /Preview/, selected: true })).toBeVisible()
  } finally {
    await shutdown()
  }
})
