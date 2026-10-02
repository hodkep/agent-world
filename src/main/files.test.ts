import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { kindOf, readText, resolveFile, startFileServer } from './files'

describe('what kind of file it is', () => {
  it('sorts by extension', () => {
    expect(kindOf('/a/report.html')).toBe('html')
    expect(kindOf('notes.md')).toBe('markdown')
    expect(kindOf('x.PDF')).toBe('pdf')
    expect(kindOf('shot.png')).toBe('image')
    expect(kindOf('src/app.ts')).toBe('code')
    expect(kindOf('data.csv')).toBe('text')
    expect(kindOf('README')).toBe('text')
    expect(kindOf('deck.pptx')).toBe('other')
  })
})

describe('finding a file an agent mentioned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aw-files-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src', 'app.ts'), 'x')
  const outside = mkdtempSync(join(tmpdir(), 'aw-out-'))
  writeFileSync(join(outside, 'r.html'), '<h1>r</h1>')
  it('resolves a relative path inside the folder', async () => {
    expect(await resolveFile(dir, 'src/app.ts')).toMatchObject({ name: 'app.ts', kind: 'code', inside: true })
  })
  it('resolves an absolute path outside it', async () => {
    expect(await resolveFile(dir, join(outside, 'r.html'))).toMatchObject({ name: 'r.html', kind: 'html', inside: false })
  })
  it('is null for a missing file or a folder', async () => {
    expect(await resolveFile(dir, 'nope.txt')).toBeNull()
    expect(await resolveFile(dir, 'src')).toBeNull()
  })
  it('reads text, cutting very large files', async () => {
    writeFileSync(join(dir, 'big.txt'), 'a'.repeat(3 * 1024 * 1024))
    const r = await readText(join(dir, 'big.txt'))
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBe(2 * 1024 * 1024)
  })
})

describe('the local page server', () => {
  let server: Awaited<ReturnType<typeof startFileServer>> | undefined
  afterEach(() => server?.close())
  it('serves the page and what sits beside it, and nothing above or elsewhere', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aw-serve-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<link rel="stylesheet" href="assets/a.css"><h1>hi</h1>')
    writeFileSync(join(dir, 'assets', 'a.css'), 'h1{color:red}')
    const secret = join(dirname2(dir), 'aw-secret.txt')
    writeFileSync(secret, 'secret')
    server = await startFileServer()
    const url = server.urlFor(join(dir, 'index.html'))
    const base = url.slice(0, url.lastIndexOf('/') + 1)
    expect(await (await fetch(url)).text()).toContain('<h1>hi</h1>')
    const css = await fetch(base + 'assets/a.css')
    expect(css.headers.get('content-type')).toContain('text/css')
    expect((await fetch(base + '..%2Faw-secret.txt')).status).toBe(403)
    expect((await fetch(base + '../aw-secret.txt')).status).not.toBe(200)
    expect((await fetch(url.replace(/[0-9a-f]{32}/, '0'.repeat(32)))).status).toBe(404)
  })
  it('serves only the one file when it sits straight in the home folder', async () => {
    const { homedir } = await import('node:os')
    const stray = join(homedir(), `.aw-test-${process.pid}.html`)
    const { rmSync } = await import('node:fs')
    writeFileSync(stray, '<p>x</p>')
    try {
      server = await startFileServer()
      const url = server.urlFor(stray)
      expect((await fetch(url)).status).toBe(200)
      expect((await fetch(url.slice(0, url.lastIndexOf('/') + 1) + '.zshrc')).status).toBe(403)
    } finally {
      rmSync(stray, { force: true })
    }
  })
})

const dirname2 = (p: string) => p.slice(0, p.lastIndexOf('/'))
