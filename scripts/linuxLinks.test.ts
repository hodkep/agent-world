import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (f: string) => readFileSync(join(root, f), 'utf8')

// The fixed addresses the mirror script puts the newest stable's Linux files at (scripts/mirror-release.sh copies v<ver>/Agent-World-<ver>-amd64.deb to latest/Agent-World-amd64.deb, and the same for the AppImage).
const DEB = 'https://dl.agent-world.in/latest/Agent-World-amd64.deb'
const APPIMAGE = 'https://dl.agent-world.in/latest/Agent-World-x86_64.AppImage'

describe('the Linux downloads are linked from the mirror, as the Mac ones are', () => {
  it.each(['README.md', 'INSTALL.md', 'site/home.html'])('%s links both Linux files on the mirror', (file) => {
    const text = read(file)
    expect(text).toContain(DEB)
    expect(text).toContain(APPIMAGE)
  })

  it('names the same files the mirror script makes', () => {
    const script = read('scripts/mirror-release.sh')
    // The script strips the version from each Linux name to make the fixed address.
    expect(script).toContain('Agent-World-$VER-amd64.deb')
    expect(script).toContain('Agent-World-$VER-x86_64.AppImage')
    expect(script).toContain('${f/-$VER-/-}')
  })

  it('the user guide no longer says there is no Linux installer', () => {
    const guide = read('docs/guide/getting-started.md')
    expect(guide).not.toMatch(/no Windows or Linux installers/i)
    expect(guide).toMatch(/Linux/)
  })

  it('does not claim a test on a real Linux desktop that has not happened', () => {
    // "has not been tested on a real desktop" is the honest sentence and must stay allowed; only a positive claim is refused.
    for (const file of ['README.md', 'INSTALL.md']) {
      expect(read(file), file).not.toMatch(/(?<!not )(?<!not been )(?<!never )tested on (a )?(real )?(Ubuntu|Linux) desktop/i)
    }
  })
})
