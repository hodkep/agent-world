import { describe, expect, it } from 'vitest'
import type { InstallState } from '../../shared/updateInstall'
import { checkNowButton, updateView } from './updateView'

const base = { state: 'available' as const, latest: '0.1.2', current: '0.1.1', url: 'https://github.com/hodkep/agent-world/releases/tag/v0.1.2', tag: 'v0.1.2' }
const view = (install?: InstallState, agents = { working: 0, waiting: 0 }) => updateView({ ...base, ...(install && { install }) }, agents)!
const ids = (v: ReturnType<typeof view>) => v.actions.map((a) => a.id)

describe('what the update chip and its popover show', () => {
  it('shows nothing when there is no newer version', () => {
    expect(updateView({ state: 'none' }, { working: 0, waiting: 0 })).toBeNull()
    expect(updateView({ state: 'checking' }, { working: 0, waiting: 0 })).toBeNull()
  })

  it('offers the download when a newer version is found, with its page as a link', () => {
    const v = view()
    expect(v.chip).toBe('↑ 0.1.2')
    expect(v.title).toBe('Agent World 0.1.2 is available')
    expect(v.body).toContain('You have 0.1.1')
    expect(v.actions).toEqual([expect.objectContaining({ id: 'download', label: 'Download', primary: true }), expect.objectContaining({ id: 'changes', label: 'What changed' })])
  })

  it('for a beta says that installing it replaces the stable app, and still offers the download, even where Homebrew installed the app', () => {
    const v = updateView({ ...base, latest: '0.7.0-beta.1', tag: 'v0.7.0-beta.1', channel: 'beta' }, { working: 0, waiting: 0 })!
    expect(v.title).toBe('Agent World 0.7.0-beta.1 is available')
    expect(v.body).toContain('replaces the stable app you have')
    expect(ids(v)).toEqual(['download', 'changes'])
  })

  const none = { working: 0, waiting: 0 }
  const SWITCH = 'Switching replaces the version you have with an older one; settings made in it may not be read by this one.'
  it('for the stable a beta goes back to says so, warns, and offers the download as going back', () => {
    const v = updateView({ ...base, latest: '0.6.3', tag: 'v0.6.3', current: '0.7.0-beta.1', rel: 'older', homebrew: true }, none)!
    expect(v.title).toBe('Back to stable 0.6.3')
    expect(v.warning).toBe('Going back replaces the beta you have; settings made in the beta may not be read by the stable version.')
    expect(v.actions).toEqual([{ id: 'download', label: 'Back to stable 0.6.3', primary: true }, { id: 'changes', label: 'What changed' }])
  })
  it('for any other release older than what is installed says it is older, warns, and offers the download as a switch', () => {
    const stable = updateView({ ...base, latest: '0.6.3', tag: 'v0.6.3', current: '0.8.0', rel: 'older' }, none)!
    expect(stable.title).toBe('Switch to 0.6.3, older than your version')
    expect(stable.warning).toBe(SWITCH)
    expect(stable.actions[0]).toEqual({ id: 'download', label: 'Switch to 0.6.3', primary: true })
    const beta = updateView({ ...base, latest: '0.9.1-beta.1', tag: 'v0.9.1-beta.1', current: '0.9.5', rel: 'older', channel: 'beta' }, none)!
    expect(beta.title).toBe('Switch to 0.9.1-beta.1, older than your version')
    expect(beta.body).toContain('Installing a beta replaces the stable app you have.')
    expect(beta.warning).toBe(SWITCH)
    // on a beta, a beta is not said to replace a stable app
    expect(updateView({ ...base, latest: '0.9.1-beta.1', tag: 'v0.9.1-beta.1', current: '0.9.5-beta.2', rel: 'older', channel: 'beta' }, none)!.body).not.toContain('stable app')
  })
  it('keeps the warning with the agents note once the older release is downloaded', () => {
    const v = updateView({ ...base, latest: '0.6.3', tag: 'v0.6.3', current: '0.7.0-beta.1', rel: 'older', install: { phase: 'ready', version: '0.6.3', file: '/f.zip' } }, { working: 1, waiting: 0 })!
    expect(v.warning).toContain('Going back replaces the beta you have')
    expect(v.warning).toContain('asleep after the restart')
  })
  it('shows nothing for a release that is the one you have', () => {
    expect(updateView({ state: 'none', latest: '0.7.0', rel: 'same', detail: 'You have 0.7.0.' }, none)).toBeNull()
  })

  it('for a copy installed with Homebrew offers the download and the install like any other, and says Homebrew\'s record may lag', () => {
    const v = updateView({ ...base, homebrew: true }, { working: 0, waiting: 0 })!
    expect(v.title).toBe('Agent World 0.1.2 is available')
    expect(v.body).toContain('You have 0.1.1')
    expect(v.body).toContain('Homebrew')
    expect(v.body).toContain('may still say 0.1.1')
    expect(ids(v)).toEqual(['download', 'changes'])
    expect(ids(updateView({ ...base, homebrew: true, install: { phase: 'ready', version: '0.1.2', file: '/x' } }, { working: 0, waiting: 0 })!)).toContain('install')
    // A copy that Homebrew did not install is told nothing about it.
    expect(view().body).not.toContain('Homebrew')
  })

  it('still offers just the page when the build gives no tag to download from', () => {
    const v = updateView({ state: 'available', latest: '0.1.2', url: base.url }, { working: 0, waiting: 0 })!
    expect(ids(v)).toEqual(['page'])
  })

  it('shows progress while downloading, with the percentage on the chip and a way to stop', () => {
    const v = view({ phase: 'downloading', version: '0.1.2', received: 126 * 1024 * 1024, total: 274 * 1024 * 1024 })
    expect(v.chip).toBe('↓ 46%')
    expect(v.title).toBe('Downloading 0.1.2')
    expect(v.progress).toMatchObject({ label: '126 of 274 MB' })
    expect(v.progress!.fraction).toBeCloseTo(0.46, 2)
    expect(ids(v)).toEqual(['cancel'])
  })

  it('says it is ready once the file is checked, with Install and restart first', () => {
    const v = view({ phase: 'ready', version: '0.1.2', file: '/x/y.zip' })
    expect(v.chip).toBe('↑ 0.1.2')
    expect(v.title).toBe('0.1.2 is ready to install')
    expect(v.ticks).toEqual(['Downloaded', "Checksum matches the release's"])
    expect(v.warning).toBeUndefined()
    expect(v.actions).toEqual([expect.objectContaining({ id: 'install', label: 'Install and restart', primary: true }), expect.objectContaining({ id: 'later', label: 'Later' })])
  })

  it('says how many agents will be asleep after the restart, and still lets it go ahead', () => {
    const ready: InstallState = { phase: 'ready', version: '0.1.2', file: '/x/y.zip' }
    expect(view(ready, { working: 3, waiting: 0 }).warning).toBe('3 agents are working. They will be asleep after the restart; wake them to resume.')
    expect(view(ready, { working: 1, waiting: 0 }).warning).toBe('1 agent is working. It will be asleep after the restart; wake it to resume.')
    expect(view(ready, { working: 0, waiting: 1 }).warning).toBe('1 agent is waiting for your answer. It will be asleep after the restart; wake it to resume.')
    expect(view(ready, { working: 2, waiting: 1 }).warning).toBe('2 agents are working and 1 is waiting for your answer. They will be asleep after the restart; wake them to resume.')
    expect(ids(view(ready, { working: 3, waiting: 0 }))).toContain('install')
  })

  it('says it is installing, with no buttons', () => {
    const v = view({ phase: 'installing', version: '0.1.2' })
    expect(v.title).toBe('Installing 0.1.2…')
    expect(v.actions).toEqual([])
    expect(v.body).toMatch(/old version is put back/)
  })

  it('says each failure in a sentence, with the way on that fits it', () => {
    const net = view({ phase: 'failed', version: '0.1.2', kind: 'network', reason: 'Agent World could not reach GitHub: ENOTFOUND' })
    expect(net.title).toBe('Could not download 0.1.2')
    expect(net.error).toContain('could not reach GitHub')
    expect(ids(net)).toEqual(['retry', 'page'])
    expect(net.actions[0]).toMatchObject({ label: 'Try again', primary: true })

    const sum = view({ phase: 'failed', version: '0.1.2', kind: 'checksum', reason: 'The file does not match the checksum published with the release, so it was deleted.' })
    expect(sum.title).toBe('The download was not used')
    expect(sum.error).toMatch(/if it happens twice/i)
    expect(sum.actions[0]).toMatchObject({ id: 'retry', label: 'Download again' })

    const blocked = view({ phase: 'failed', version: '0.1.2', kind: 'blocked', reason: 'Agent World cannot change the folder it is in.', file: '/x/y.zip' })
    expect(blocked.title).toBe('0.1.2 is downloaded, but cannot be installed from here')
    expect(ids(blocked)).toEqual(['finder', 'page'])

    const roOnly = view({ phase: 'failed', version: '0.1.2', kind: 'blocked', reason: 'macOS is running Agent World from a temporary read-only place.' })
    expect(ids(roOnly)).toEqual(['page'])

    const inst = view({ phase: 'failed', kind: 'install', reason: 'The last update was not installed: its signature does not verify' })
    expect(inst.title).toBe('The update was not installed')
    expect(ids(inst)).toEqual(['page', 'log'])
  })

  it('is the offer again after a download was stopped', () => {
    const v = view({ phase: 'failed', version: '0.1.2', kind: 'cancelled', reason: 'The download was stopped.' })
    expect(v.title).toBe('Agent World 0.1.2 is available')
    expect(ids(v)).toEqual(['download', 'changes'])
  })
})

describe("the new version's notes in the popover", () => {
  const notes = '## What changed\n\n- A thing'
  it('come with the offer and stay through the download, the downloaded update and the install, and are not shown with an error', () => {
    expect(view().notes).toBeUndefined()
    const withNotes = (install?: InstallState) => updateView({ ...base, notes, ...(install && { install }) }, { working: 0, waiting: 0 })!
    expect(withNotes().notes).toBe(notes)
    expect(withNotes({ phase: 'downloading', version: '0.1.2', received: 1, total: 4 }).notes).toBe(notes)
    expect(withNotes({ phase: 'ready', version: '0.1.2', file: '/x.zip' }).notes).toBe(notes)
    expect(withNotes({ phase: 'installing', version: '0.1.2' }).notes).toBe(notes)
    expect(withNotes({ phase: 'failed', version: '0.1.2', kind: 'network', reason: 'No network.' }).notes).toBeUndefined()
  })
})

describe('the Check now button', () => {
  const found = { state: 'available' as const, latest: '0.3.0', current: '0.2.0' }
  it('is there, and works, when nothing is downloading or waiting to be installed', () => {
    expect(checkNowButton({ state: 'none' })).toEqual({ label: 'Check now', disabled: false })
    expect(checkNowButton(found)).toEqual({ label: 'Check now', disabled: false })
    expect(checkNowButton({ ...found, install: { phase: 'idle' } })).toEqual({ label: 'Check now', disabled: false })
    // A download that failed or was stopped is no longer running: looking again is fine.
    expect(checkNowButton({ ...found, install: { phase: 'failed', kind: 'network', reason: 'x', version: '0.3.0' } }).disabled).toBe(false)
    expect(checkNowButton({ ...found, install: { phase: 'failed', kind: 'cancelled', reason: 'x', version: '0.3.0' } }).disabled).toBe(false)
  })
  it('is greyed, with the reason, while a look is under way', () => {
    expect(checkNowButton({ state: 'checking' })).toEqual({ label: 'Checking…', disabled: true, reason: 'Looking for a newer version.' })
  })
  it('is greyed, with the reason, from the moment a download starts until the app restarts: pressing it would start the download again', () => {
    expect(checkNowButton({ ...found, install: { phase: 'downloading', version: '0.3.0', received: 1, total: 10 } })).toEqual({ label: 'Check now', disabled: true, reason: 'A download is under way.' })
    expect(checkNowButton({ ...found, install: { phase: 'ready', version: '0.3.0', file: '/x.zip' } })).toEqual({ label: 'Check now', disabled: true, reason: '0.3.0 is downloaded; restart to install it.' })
    expect(checkNowButton({ ...found, install: { phase: 'installing', version: '0.3.0' } }).disabled).toBe(true)
  })
})
