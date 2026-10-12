import { describe, expect, it } from 'vitest'
import { pagePath, pagesOpenedBy } from './pagePath'

describe('pagePath: what typed into the Preview bar is a local page', () => {
  it('takes an absolute path, a ~ path and a file address to a web page, as a plain path', () => {
    expect(pagePath('/tmp/design/index.html')).toBe('/tmp/design/index.html')
    expect(pagePath('~/work/page.htm')).toBe('~/work/page.htm')
    expect(pagePath('file:///tmp/my%20design/a.html')).toBe('/tmp/my design/a.html')
    expect(pagePath('  /tmp/a.html  ')).toBe('/tmp/a.html')
    expect(pagePath('C:\\Users\\me\\a.html')).toBe('C:\\Users\\me\\a.html')
  })
  it('takes a PDF too, since the file server shows those', () => {
    expect(pagePath('/tmp/report.pdf')).toBe('/tmp/report.pdf')
  })
  it('takes a path from the agent\'s folder too, as it was typed', () => {
    for (const t of ['a.html', 'index.htm', './out/index.html', '../site/a.html', 'site/index.html', 'my design/a.html', 'out\\index.html']) expect(pagePath(t)).toBe(t)
  })
  it('leaves addresses, ports, other files and a missing name alone', () => {
    for (const t of ['5287', 'localhost:3000/a.html', 'localhost:3000', 'http://localhost:3000/a.html', 'https://example.com/a.html', '/tmp/notes.md', '/tmp/', '~', 'notes.md', 'site/', '', '   ']) expect(pagePath(t)).toBeNull()
  })
})

const cmd = (command: string) => JSON.stringify({ command })

describe('pagesOpenedBy: the pages a tool call opens in a browser', () => {
  it('finds the file of open, xdg-open and start, quoted or not', () => {
    expect(pagesOpenedBy(cmd('open /tmp/a.html'))).toEqual(['/tmp/a.html'])
    expect(pagesOpenedBy(cmd('xdg-open ./out/index.html'))).toEqual(['./out/index.html'])
    expect(pagesOpenedBy(cmd('open "/tmp/my design/a.html"'))).toEqual(['/tmp/my design/a.html'])
    expect(pagesOpenedBy(cmd("open '/tmp/my design/a.html'"))).toEqual(['/tmp/my design/a.html'])
    expect(pagesOpenedBy(cmd('start "" "C:\\x\\a.html"'))).toEqual(['C:\\x\\a.html'])
    expect(pagesOpenedBy(cmd('cmd /c start page.htm'))).toEqual(['page.htm'])
  })
  it('skips what an option takes, so the app named with -a is not taken for the page', () => {
    expect(pagesOpenedBy(cmd('open -a "Google Chrome" /tmp/a.html'))).toEqual(['/tmp/a.html'])
    expect(pagesOpenedBy(cmd('open -g -n page.html'))).toEqual(['page.html'])
  })
  it('reads a backslash-escaped space, and a command on its own line', () => {
    expect(pagesOpenedBy(cmd('open /tmp/my\\ design/a.html'))).toEqual(['/tmp/my design/a.html'])
    expect(pagesOpenedBy(cmd('echo done\nopen /tmp/a.html'))).toEqual(['/tmp/a.html'])
    expect(pagesOpenedBy(cmd('open\t/tmp/a.html'))).toEqual(['/tmp/a.html'])
  })
  it('finds it after other commands and in a file: address', () => {
    expect(pagesOpenedBy(cmd('cd /tmp/x && open index.html'))).toEqual(['index.html'])
    expect(pagesOpenedBy(cmd('python build.py; xdg-open out/a.html | cat'))).toEqual(['out/a.html'])
    expect(pagesOpenedBy(cmd('open file:///tmp/a.html'))).toEqual(['file:///tmp/a.html'])
  })
  it('finds a file address a browser tool is sent to', () => {
    expect(pagesOpenedBy(JSON.stringify({ url: 'file:///tmp/a.html' }))).toEqual(['file:///tmp/a.html'])
    expect(pagesOpenedBy(JSON.stringify({ url: 'http://localhost:3000/a.html' }))).toEqual([])
  })
  it('ignores anything that is not opening a page: other files, folders, addresses, other commands', () => {
    for (const c of ['open /tmp/a.png', 'open .', 'open https://example.com/a.html', 'cat page.html', 'echo open page.html', 'ls *.html', 'grep -r open a.html', 'python -m http.server']) expect(pagesOpenedBy(cmd(c))).toEqual([])
    expect(pagesOpenedBy('not json')).toEqual([])
    expect(pagesOpenedBy(JSON.stringify({ file_path: '/tmp/a.html', content: 'x' }))).toEqual([])
  })
})
