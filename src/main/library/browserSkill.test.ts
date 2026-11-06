import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Library } from './store'
import { Playbooks } from './playbook'
import { AGENT_BROWSER_VERSION, BROWSER_ID, BROWSER_TOOLS, syncBrowserSkill } from './browserSkill'

const setup = () => join(mkdtempSync(join(tmpdir(), 'aw-browser-')), 'library')

describe('the Preview browser as a library item', () => {
  it('is a built-in skill an agent can read: what it is for, and the commands, with no flags to give', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const item = (await new Library(root).get(BROWSER_ID))!
    expect(item.kind).toBe('skill')
    expect(item.source).toBe('built-in')
    expect(item.description).toMatch(/real browser/i)
    for (const c of ['open <address>', 'snapshot -i', 'click @', 'fill @', 'screenshot']) expect(item.body).toContain(c)
    expect(item.body).toContain(`agent-browser@${AGENT_BROWSER_VERSION}`)
    expect(item.body).not.toMatch(/--cdp/)
  })

  it('says what the agent must know about the setup: its own page, the person is asked about new sites, refusals are final', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    expect(body).toMatch(/one tab/i)
    expect(body).toMatch(/not allowed|asks the person/i)
    expect(body).toMatch(/not now/i)
    expect(body).toMatch(/403/)
    expect(body).toMatch(/cookie/i)
    expect(body).toMatch(/AW_BROWSER_CDP/)
  })

  it('tells the agent to run one command at a time, plain, and what to do when one is blocked instead of changing tool', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    expect(body).toMatch(/one command per call/i)
    expect(body).toMatch(/no pipes|without pipes|not .*pipe/i)
    expect(body).toMatch(/blocked|not allowed|denied/i)
    expect(body).toMatch(/do not (switch|use another|fall back)|instead of (switching|another)/i)
    expect(body).toMatch(/tell the person/i)
  })

  it('tells the agent to try the plain form once when Claude Code’s safety check blocks an address with a query: open the site, then use its own search box', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    expect(body).toMatch(/query string|\?q=|search box/i)
    expect(body).toMatch(/own search box|page's own|site's own/i)
  })

  it('tells the agent a CAPTCHA or a login is the person’s to do, in the same Preview', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    expect(body).toMatch(/captcha/i)
    expect(body).toMatch(/person (can|does|solves|ticks)|ask the person/i)
  })

  it('tells the agent what to do when a site is waiting for the person’s OK: tell them, then run the same command again', async () => {
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    expect(body).toMatch(/waiting for the person/i)
    expect(body).toMatch(/same command again/i)
  })

  it('has its commands allowed up front, by the exact pinned form the skill shows, so no one is asked and no classifier guesses', async () => {
    expect(BROWSER_TOOLS).toEqual([`Bash(npx -y agent-browser@${AGENT_BROWSER_VERSION}:*)`])
    const root = setup()
    syncBrowserSkill({ root })
    const body = (await new Library(root).get(BROWSER_ID))!.body
    const prefix = /^Bash\((.*):\*\)$/.exec(BROWSER_TOOLS[0]!)![1]!
    // every command the skill shows starts with the allowed prefix
    const shown = [...body.matchAll(/`(npx -y agent-browser@[^`]*)`/g)].map((m) => m[1]!)
    expect(shown.length).toBeGreaterThan(3)
    for (const s of shown) expect(s.startsWith(prefix)).toBe(true)
  })

  it('is rewritten only when its text changes', () => {
    const root = setup()
    syncBrowserSkill({ root })
    const file = join(root, 'skills', BROWSER_ID, 'SKILL.md')
    const before = readFileSync(file, 'utf8')
    writeFileSync(file, before + '\nedited by hand')
    syncBrowserSkill({ root })
    // an unchanged text is left alone, a hand edit is the person's: it stays until the app's text changes
    expect(readFileSync(file, 'utf8')).toBe(before + '\nedited by hand')
  })

  it('puts one rule in the Everywhere playbook once: when a task needs a real browser, read it; and it stays out if the person took it out', () => {
    const root = setup()
    syncBrowserSkill({ root })
    const playbooks = new Playbooks(root)
    const rules = playbooks.read('global').filter((r) => r.id === BROWSER_ID)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ mode: 'on-demand', strength: 'soft' })
    expect(rules[0]!.when).toMatch(/real browser/i)
    syncBrowserSkill({ root })
    expect(playbooks.read('global').filter((r) => r.id === BROWSER_ID)).toHaveLength(1)
    playbooks.write('global', [])
    syncBrowserSkill({ root })
    expect(playbooks.read('global')).toEqual([])
    expect(existsSync(join(root, 'skills', BROWSER_ID, 'SKILL.md'))).toBe(true)
  })
})
