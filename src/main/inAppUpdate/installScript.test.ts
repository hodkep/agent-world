import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSTALL_SCRIPT, installBlocker } from './installScript'

describe('where the app may replace itself', () => {
  it('may in a folder it can write to', () => {
    expect(installBlocker({ appPath: '/Applications/Agent World.app', parentWritable: true, readOnlyVolume: false })).toBeNull()
  })
  it('says why not in a place macOS runs it from read-only after a first open', () => {
    expect(installBlocker({ appPath: '/private/var/folders/xx/T/AppTranslocation/ABC/d/Agent World.app', parentWritable: true, readOnlyVolume: false })).toMatch(/read-only|moved/i)
  })
  it('says why not on a read-only volume such as the disk image, or a folder it cannot write to', () => {
    expect(installBlocker({ appPath: '/Volumes/Agent World/Agent World.app', parentWritable: false, readOnlyVolume: true })).toMatch(/read-only/i)
    expect(installBlocker({ appPath: '/Applications/Agent World.app', parentWritable: false, readOnlyVolume: false })).toMatch(/cannot change the folder/i)
  })
  it('will not go near a path that is not an app bundle', () => {
    for (const p of ['', '/Applications', '/Applications/Agent World.app/', 'Agent World.app', '/Applications/Agent World']) expect(installBlocker({ appPath: p, parentWritable: true, readOnlyVolume: false }), p).not.toBeNull()
  })
})

describe('the helper script', () => {
  it('has no elevation in it and takes everything it is told as arguments, never in its own text', () => {
    expect(INSTALL_SCRIPT).not.toMatch(/sudo|osascript|authorization|chmod 777|rm -rf "\$APP"/i)
    expect(INSTALL_SCRIPT).not.toContain('${{')
    expect(INSTALL_SCRIPT.startsWith('#!/bin/sh')).toBe(true)
  })
})

// The script runs against fake bundles in a temp folder. ditto and PlistBuddy are the real ones; the ones that would change the machine are stood in for.
describe.skipIf(process.platform !== 'darwin')('the helper script on fake bundles', () => {
  const plist = (id: string, version: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`
  const bundle = (root: string, name: string, o: { id?: string; version?: string; marker: string }) => {
    const b = join(root, name)
    mkdirSync(join(b, 'Contents'), { recursive: true })
    writeFileSync(join(b, 'Contents', 'Info.plist'), plist(o.id ?? 'dev.agentworld.app', o.version ?? '0.1.2'))
    writeFileSync(join(b, 'Contents', 'marker'), o.marker)
    return b
  }
  const zipOf = (root: string, apps: string[]) => {
    const src = mkdtempSync(join(root, 'src-'))
    for (const a of apps) bundle(src, a, { marker: 'new' })
    // A zip of nothing cannot be made: one that holds no app holds something else.
    if (apps.length === 0) writeFileSync(join(src, 'readme.txt'), 'no app here')
    const zip = join(root, 'update.zip')
    expect(spawnSync('/usr/bin/ditto', ['-c', '-k', src, zip]).status).toBe(0)
    return zip
  }
  const tool = (root: string, name: string, body: string) => {
    const p = join(root, name)
    writeFileSync(p, `#!/bin/sh\n${body}\n`)
    chmodSync(p, 0o755)
    return p
  }
  const world = (appName = "Agent World's.app") => {
    const root = mkdtempSync(join(tmpdir(), 'aw install ')) // a space, as /Applications/Agent World.app has
    const apps = join(root, 'Apps')
    mkdirSync(apps)
    const app = bundle(apps, appName, { id: 'dev.agentworld.app', version: '0.1.1', marker: 'old' })
    const opened = join(root, 'opened.log')
    const script = join(root, 'install.sh')
    writeFileSync(script, INSTALL_SCRIPT)
    return { root, apps, app, opened, script, log: join(root, 'update.log'), result: join(root, 'update.result'), open: tool(root, 'open', `echo "$@" >> "${opened}"`), signOk: tool(root, 'sign-ok', 'exit 0'), signBad: tool(root, 'sign-bad', 'echo "a sealed resource is missing" >&2; exit 1') }
  }
  const run = (w: ReturnType<typeof world>, o: { zip: string; version?: string; id?: string; pid?: number; codesign?: string; mv?: string }) =>
    spawnSync('/bin/sh', [w.script, String(o.pid ?? 999999), o.zip, w.app, o.version ?? '0.1.2', o.id ?? 'dev.agentworld.app', w.log, w.result], { env: { ...process.env, AW_OPEN: w.open, AW_CODESIGN: o.codesign ?? w.signOk, ...(o.mv && { AW_MV: o.mv }) }, encoding: 'utf8' })
  const marker = (app: string) => readFileSync(join(app, 'Contents', 'marker'), 'utf8')
  const leftovers = (w: ReturnType<typeof world>) => readdirSync(w.apps).filter((n) => n.startsWith('.'))

  it('puts the new version in the place of the old one, removes what it made, and opens the app', () => {
    const w = world()
    const r = run(w, { zip: zipOf(w.root, ['Agent World.app']) })
    expect(r.status).toBe(0)
    expect(marker(w.app)).toBe('new')
    expect(leftovers(w)).toEqual([])
    expect(readFileSync(w.opened, 'utf8').trim()).toBe(w.app)
    expect(readFileSync(w.result, 'utf8')).toMatch(/^ok/)
  })

  it('waits for the app to quit before it touches anything', async () => {
    const w = world()
    const zip = zipOf(w.root, ['Agent World.app'])
    const sleeper = spawn('/bin/sleep', ['1.5'], { stdio: 'ignore' })
    const t0 = Date.now()
    const done = new Promise<number>((resolve) => spawn('/bin/sh', [w.script, String(sleeper.pid), zip, w.app, '0.1.2', 'dev.agentworld.app', w.log, w.result], { env: { ...process.env, AW_OPEN: w.open, AW_CODESIGN: w.signOk }, stdio: 'ignore' }).on('exit', (c) => resolve(c ?? -1)))
    await new Promise((r) => setTimeout(r, 500))
    expect(marker(w.app)).toBe('old')
    expect(await done).toBe(0)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1300)
    expect(marker(w.app)).toBe('new')
  })

  it('keeps the old version and opens it when the new one has another bundle identifier', () => {
    const w = world()
    const r = run(w, { zip: zipOf(w.root, ['Agent World.app']), id: 'com.evil.app' })
    expect(r.status).not.toBe(0)
    expect(marker(w.app)).toBe('old')
    expect(leftovers(w)).toEqual([])
    expect(readFileSync(w.opened, 'utf8').trim()).toBe(w.app)
    expect(readFileSync(w.result, 'utf8')).toMatch(/^failed.*identi/i)
  })

  it('keeps the old version when the new one is not the version the check announced', () => {
    const w = world()
    const r = run(w, { zip: zipOf(w.root, ['Agent World.app']), version: '0.1.3' })
    expect(r.status).not.toBe(0)
    expect(marker(w.app)).toBe('old')
    expect(readFileSync(w.result, 'utf8')).toMatch(/^failed.*version/i)
  })

  it('keeps the old version when the new one does not pass codesign --verify', () => {
    const w = world()
    const r = run(w, { zip: zipOf(w.root, ['Agent World.app']), codesign: w.signBad })
    expect(r.status).not.toBe(0)
    expect(marker(w.app)).toBe('old')
    expect(leftovers(w)).toEqual([])
    expect(readFileSync(w.result, 'utf8')).toMatch(/^failed.*signature/i)
  })

  it('puts the old version back when the move of the new one fails', () => {
    const w = world()
    // Moving the unpacked new version into place fails; moving the old one aside and back works.
    const mv = tool(w.root, 'mv-fails', `case "$1" in *.agent-world-update.*) exit 1;; esac\nexec /bin/mv "$@"`)
    const r = run(w, { zip: zipOf(w.root, ['Agent World.app']), mv })
    expect(r.status).not.toBe(0)
    expect(marker(w.app)).toBe('old')
    expect(leftovers(w)).toEqual([])
    expect(readFileSync(w.opened, 'utf8').trim()).toBe(w.app)
    expect(readFileSync(w.result, 'utf8')).toMatch(/^failed/)
  })

  it('keeps the old version when the zip holds no app, or two', () => {
    for (const apps of [[], ['A.app', 'B.app']]) {
      const w = world()
      const r = run(w, { zip: zipOf(w.root, apps) })
      expect(r.status).not.toBe(0)
      expect(marker(w.app)).toBe('old')
      expect(leftovers(w)).toEqual([])
    }
  })

  it('does not run on a path that is not an app bundle', () => {
    const w = world()
    const zip = zipOf(w.root, ['Agent World.app'])
    const r = spawnSync('/bin/sh', [w.script, '999999', zip, w.apps, '0.1.2', 'dev.agentworld.app', w.log, w.result], { env: { ...process.env, AW_OPEN: w.open, AW_CODESIGN: w.signOk }, encoding: 'utf8' })
    expect(r.status).not.toBe(0)
    expect(existsSync(w.app)).toBe(true)
  })
})
