import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { githubOwner, logoOf, pluginIcon, saveLogo } from './logos'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'aw-logo-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

const PNG = Buffer.from('89504e470d0a1a0a', 'hex')
const reply = (type: string, body: Buffer = PNG, ok = true, length?: string) => vi.fn(async () => ({ ok, headers: { get: (n: string) => (n === 'content-length' ? (length ?? null) : type) }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) }))

describe('where a skill gets its logo', () => {
  it('finds the icon of the plugin a skill sits in, however deep the skill is', () => {
    const plugin = join(dir, 'plug')
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    writeFileSync(join(plugin, '.claude-plugin', 'icon.png'), PNG)
    mkdirSync(join(plugin, 'skills', 'a', 'sub'), { recursive: true })
    expect(pluginIcon(join(plugin, 'skills', 'a'))).toBe(join(plugin, '.claude-plugin', 'icon.png'))
    expect(pluginIcon(join(dir, 'nowhere'))).toBeNull()
  })
  it('names the GitHub owner only for a source that is a GitHub repository', () => {
    expect(githubOwner('vercel-labs/skills')).toBe('vercel-labs')
    expect(githubOwner('https://github.com/obra/superpowers.git')).toBe('obra')
    expect(githubOwner('github.com/juliusbrussee/caveman')).toBe('juliusbrussee')
    expect(githubOwner('impeccable 4.1.3')).toBeNull()
    expect(githubOwner('../../etc')).toBeNull()
    expect(githubOwner(undefined)).toBeNull()
  })
})

describe('keeping a logo', () => {
  it('copies a plugin icon, with no network', async () => {
    const plugin = join(dir, 'plug')
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    mkdirSync(join(plugin, 'skills', 'a'), { recursive: true })
    writeFileSync(join(plugin, '.claude-plugin', 'icon.png'), PNG)
    const fetch = reply('image/png')
    expect(await saveLogo(join(dir, 'lib'), 'a', { kind: 'plugin', real: join(plugin, 'skills', 'a') }, fetch)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(logoOf(join(dir, 'lib'), 'a')).toMatch(/^data:image\/png;base64,/)
  })
  it('fetches the owner picture once for a GitHub source, and a failure is remembered so it is not tried on every open', async () => {
    const root = join(dir, 'lib')
    const ok = reply('image/png')
    expect(await saveLogo(root, 'caveman', { kind: 'global', real: dir, from: 'vercel-labs/skills' }, ok)).toBe(true)
    expect(ok).toHaveBeenCalledWith('https://github.com/vercel-labs.png?size=64', expect.anything())
    const bad = reply('text/html')
    expect(await saveLogo(root, 'other', { kind: 'global', real: dir, from: 'x/y' }, bad)).toBe(false)
    await saveLogo(root, 'other', { kind: 'global', real: dir, from: 'x/y' }, bad)
    expect(bad).toHaveBeenCalledTimes(1)
    expect(logoOf(root, 'other')).toBeUndefined()
    // Refresh asks again.
    await saveLogo(root, 'other', { kind: 'global', real: dir, from: 'x/y' }, ok, true)
    expect(logoOf(root, 'other')).toBeDefined()
    expect(readdirSync(join(root, 'logos')).filter((f) => f.startsWith('other'))).toEqual(['other.png'])
  })
  it('keeps nothing for a local skill, a network error or a picture that is too large', async () => {
    const root = join(dir, 'lib')
    const fetch = reply('image/png')
    expect(await saveLogo(root, 'mine', { kind: 'global', real: dir }, fetch)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(await saveLogo(root, 'e', { kind: 'global', real: dir, from: 'a/b' }, vi.fn(async () => Promise.reject(new Error('offline'))))).toBe(false)
    expect(await saveLogo(root, 'big', { kind: 'global', real: dir, from: 'a/b' }, reply('image/png', Buffer.alloc(300_000)))).toBe(false)
    expect(existsSync(join(root, 'logos', 'big.png'))).toBe(false)
  })
  it('does not trust an icon that is a link or not a PNG, nor a picture announced as too large, nor an id that could leave the logos folder', async () => {
    const root = join(dir, 'lib')
    const plugin = join(dir, 'plug')
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    mkdirSync(join(plugin, 'skills', 'a'), { recursive: true })
    writeFileSync(join(dir, 'secret.txt'), 'private')
    symlinkSync(join(dir, 'secret.txt'), join(plugin, '.claude-plugin', 'icon.png'))
    expect(await saveLogo(root, 'a', { kind: 'plugin', real: join(plugin, 'skills', 'a') }, reply('image/png'))).toBe(false)
    rmSync(join(plugin, '.claude-plugin', 'icon.png'))
    writeFileSync(join(plugin, '.claude-plugin', 'icon.png'), 'not a png')
    expect(await saveLogo(root, 'a', { kind: 'plugin', real: join(plugin, 'skills', 'a') }, reply('image/png'))).toBe(false)
    const big = reply('image/png', PNG, true, '9000000')
    expect(await saveLogo(root, 'b', { kind: 'global', real: dir, from: 'a/b' }, big)).toBe(false)
    expect(logoOf(root, 'a')).toBeUndefined()
    await expect(saveLogo(root, '../escape', { kind: 'global', real: dir, from: 'a/b' }, reply('image/png'))).resolves.toBe(false)
    expect(existsSync(join(dir, 'escape.png'))).toBe(false)
  })
})
