import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (f: string) => readFileSync(join(root, f), 'utf8')
/** The lines under one top-level key of electron-builder.yml, up to the next top-level key. */
const block = (yml: string, key: string) => {
  const lines = yml.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`${key}:`))
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^\S/.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

describe('the Linux beta package', () => {
  const linux = block(read('electron-builder.yml'), 'linux')
  it('is an AppImage and a deb, for x64 only', () => {
    expect(linux).toMatch(/target: AppImage[^\n]*arch: \[x64\]/)
    expect(linux).toMatch(/target: deb[^\n]*arch: \[x64\]/)
    expect(linux).not.toMatch(/arm64|rpm/)
  })
  it('carries the git for the processor it was built for, as the Mac app does', () => {
    expect(linux).toContain('build/git/linux-${arch}')
    expect(linux).toMatch(/to: git/)
  })
  it('is a developer tool in the desktop menu, and the app is started by a name a shell can type', () => {
    expect(linux).toMatch(/category: Development/)
    expect(linux).toMatch(/executableName: agent-world/)
    expect(linux).toMatch(/syncDesktopName: true/)
    expect(JSON.parse(read('package.json')).desktopName).toBe('agent-world.desktop')
  })
  it('does not describe itself as the Mac app in the deb', () => {
    expect(linux).toMatch(/description: [^\n]*Linux beta/)
  })
})

describe('the Linux build workflow', () => {
  const wf = read('.github/workflows/release-linux.yml')
  it('builds on a pull request that touches the packaging, and uploads only when started by hand for a tag', () => {
    expect(wf).toMatch(/pull_request:/)
    expect(wf).toMatch(/workflow_dispatch:/)
    expect(wf).toMatch(/if: github\.event_name == 'workflow_dispatch'/)
  })
  it('keeps the token that can write away from the build, which runs the code of a pull request', () => {
    expect(wf).toMatch(/^permissions:\n  contents: read/m)
    expect(wf.match(/contents: write/g)).toHaveLength(1)
    expect(wf.indexOf('contents: write')).toBeGreaterThan(wf.indexOf('  upload:'))
  })
  it('starts the built AppImage before anything is uploaded', () => {
    expect(wf.indexOf('scripts/smoke-linux.mjs')).toBeGreaterThan(0)
    expect(wf.indexOf('scripts/smoke-linux.mjs')).toBeLessThan(wf.indexOf('  upload:'))
  })
  it('names the files it starts and uploads by their kind, because electron-builder spells the processor x86_64 and amd64 in their names', () => {
    expect(wf).toMatch(/smoke-linux\.mjs dist\/\*\.AppImage/)
    expect(wf).not.toMatch(/-x64\.(AppImage|deb)/)
  })
  it('builds nothing but Linux and never publishes from electron-builder', () => {
    expect(wf).toMatch(/--linux/)
    expect(wf).toMatch(/--publish never/)
  })
})

describe('the Linux start-up check', () => {
  const smoke = read('scripts/smoke-linux.mjs')
  it('takes the app process before it closes the app, because Playwright forgets the app once it is closed and asking it then throws', () => {
    const taken = smoke.indexOf('app.process()')
    expect(taken).toBeGreaterThan(0)
    expect(taken).toBeLessThan(smoke.indexOf('app.close()'))
  })
})
