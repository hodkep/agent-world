import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// docs/markdown-torture-test.md is the document to paste into any chat; this test reads it through the real chat view.
test('the chat renders the Markdown stress document', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-md-')))
  const dir = join(home, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  // A tiny picture on disk (shown through its path) and one served over http (shown by address).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR4nGNk+M/wn4EIwESMolGFAAAAAElFTkSuQmCC', 'base64')
  const pngPath = join(home, 'pic.png')
  writeFileSync(pngPath, png)
  const server = createServer((_, res) => (res.setHeader('content-type', 'image/png'), res.end(png)))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  const doc = join(home, 'doc.md')
  writeFileSync(doc, `${readFileSync(resolve(__dirname, '../docs/markdown-torture-test.md'), 'utf8')}\n\n![Local file](${pngPath})\n\n![From a local server](http://127.0.0.1:${port}/p.png)\n`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const md = page.getByRole('log', { name: 'Conversation with ada' }).locator('.md').first()
    await expect(md.getByRole('heading', { name: 'Markdown stress test' })).toBeVisible({ timeout: 15_000 })

    // Block structure.
    for (const level of [1, 2, 3, 4, 5, 6]) await expect(md.locator(`h${level}`).first()).toBeVisible()
    await expect(md.locator('h1', { hasText: 'Setext heading one' })).toHaveCount(1)
    await expect(md.locator('ul ul ul ul')).not.toHaveCount(0)
    await expect(md.locator('ol ol')).not.toHaveCount(0)
    await expect(md.locator('li input[type=checkbox]')).toHaveCount(4)
    await expect(md.locator('li input[type=checkbox]:checked')).toHaveCount(2)
    await expect(md.locator('blockquote blockquote blockquote')).toHaveCount(1)
    await expect(md.locator('hr')).toHaveCount(3)

    // Tables keep their alignment.
    const table = md.locator('table').first()
    await expect(table.locator('th').nth(1)).toHaveCSS('text-align', 'center')
    await expect(table.locator('th').nth(2)).toHaveCSS('text-align', 'right')
    await expect(md.locator('table')).toHaveCount(2)

    // Code: fences become blocks, languages get Monaco's colour spans, and the fence-in-a-fence survives.
    await expect(md.locator('pre code.language-ts span').first()).toBeVisible()
    expect(await md.locator('pre').count()).toBeGreaterThan(10)
    await expect(md.locator('pre', { hasText: 'A four-backtick fence holding a three-backtick fence' })).toContainText('console.log')

    // Inline HTML that is safe stays; anything that could run is gone.
    await expect(md.locator('details summary')).toContainText('Click to expand')
    await expect(md.locator('kbd')).toHaveCount(2)
    await expect(md.locator('sub').first()).toContainText('2')
    await expect(md.locator('sup').first()).toContainText('2')
    await expect(md.locator('mark', { hasText: 'Highlighted' })).toHaveCount(1)
    await expect(md.locator('script')).toHaveCount(0)
    await expect(md.locator('[onerror]')).toHaveCount(0)
    await expect(md.locator('a[href^="javascript:"]')).toHaveCount(0)

    // Links.
    await expect(md.locator('a[href="https://example.com/reference"]')).toHaveCount(1)
    await expect(md.locator('a[href="https://example.com/autolink"]')).toHaveCount(1)

    // Wide tables scroll sideways and keep their column names whole.
    const wide = md.locator('.table-wrap').nth(1)
    expect(await wide.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    expect(await wide.locator('th').first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(50)
    await expect(wide.locator('th', { hasText: 'gracefully' })).toBeVisible()

    // Pictures: inline data, a file on disk, a web address, and a missing file that falls back to its alt text.
    const loaded = (alt: string) => md.locator(`img[alt="${alt}"]`).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
    await expect.poll(() => loaded('Data URI image')).toBe(true)
    await expect.poll(() => loaded('Local file')).toBe(true)
    await expect.poll(() => loaded('From a local server')).toBe(true)
    await expect(md.locator('img[alt^="Alt text only"]')).toHaveCount(1)

    // Links to headings and footnotes jump inside the message.
    await expect(md.locator('h2[id="3-lists"]')).toHaveCount(1)

    // Section 9: the extended syntax.
    await expect(md.locator('a[data-footnote-ref]')).toHaveCount(1)
    await expect(md.locator('.footnotes')).toContainText('The footnote text.')
    await expect(md.locator('.katex')).not.toHaveCount(0)
    await expect(md.locator('.katex-display')).toHaveCount(1)
    await expect(md.locator('.mermaid svg')).toHaveCount(1, { timeout: 20_000 })
    await expect(md.locator('.mermaid svg text', { hasText: 'Is it rendered?' })).toHaveCount(1)
    await expect(md.locator('.markdown-alert-note')).toContainText('A GitHub-style alert.')
    await expect(md.locator('.markdown-alert-warning')).toContainText('Another one.')
    await expect(md.locator('dl dt')).toContainText('Term')
    await expect(md.locator('dl dd')).toContainText('Definition of the term')
    await expect(md).toContainText('🎉 🚀 👍')
    await expect(md.locator('mark', { hasText: 'equals signs' })).toHaveCount(1)
    await expect(md.locator('sub', { hasText: '2' }).first()).toBeVisible()
    await expect(md.locator('sup', { hasText: '2' }).nth(1)).toBeVisible()
    // Strikethrough with two tildes still works, and the references that need a target stay plain text.
    await expect(md.locator('del', { hasText: 'strikethrough' })).toHaveCount(1)
    await expect(md).toContainText('[[wiki-link]]')

    // For eyeballing: AW_SHOTS=<dir> saves the log scrolled to a few sections.
    if (process.env.AW_SHOTS) {
      for (const [i, name] of ['3. Lists', '4. Tables', '6. Code', '7. Inline HTML', '8. Links and images', '9. Extended syntax'].entries()) {
        await md.getByRole('heading', { name: new RegExp(`^${name}`) }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(process.env.AW_SHOTS, `md-${i}.png`) })
      }
    }
  } finally {
    server.close()
    await shutdown()
  }
})

// A reply's own line breaks show in the chat as in the Claude Code terminal: a line under a list item stays on its own line, a paragraph of two lines shows two.
test('the chat keeps the single line breaks of a reply, and a blank line still starts a paragraph', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-md-')))
  const dir = join(home, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(home, 'doc.md')
  writeFileSync(doc, '## heading\n1. xxx\n2. xxx\nanother one\n3. xxx\n4. xxx\nanother one\n5. xxx\n6. ssss\nparagraph\n\nfirst line\nsecond line\n\nnew paragraph\n\n```\nkept\n  as it is\n```\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const md = page.getByRole('log', { name: 'Conversation with ada' }).locator('.md').first()
    await expect(md.getByRole('heading', { name: 'heading' })).toBeVisible({ timeout: 15_000 })
    // "another one" is on its own line under item 2 (a break inside the item), and "paragraph" under item 6.
    const items = md.locator('ol > li')
    await expect(items).toHaveCount(6)
    await expect(items.nth(1).locator('br')).toHaveCount(1)
    expect((await items.nth(1).innerText()).split('\n').map((l) => l.trim())).toEqual(['xxx', 'another one'])
    expect((await items.nth(3).innerText()).split('\n').map((l) => l.trim())).toEqual(['xxx', 'another one'])
    expect((await items.nth(5).innerText()).split('\n').map((l) => l.trim())).toEqual(['ssss', 'paragraph'])
    // A paragraph of two lines shows two lines; a blank line starts another paragraph; a code block is untouched.
    const two = md.locator('p', { hasText: 'first line' })
    expect((await two.innerText()).split('\n')).toEqual(['first line', 'second line'])
    await expect(md.locator('p', { hasText: 'new paragraph' })).toHaveCount(1)
    await expect(md.locator('pre code')).toHaveText('kept\n  as it is\n')
    if (process.env.AW_SHOTS) await page.screenshot({ path: join(process.env.AW_SHOTS, 'chat-line-breaks.png') })
  } finally {
    await shutdown()
  }
})

