import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const fakeClaude = resolve(__dirname, 'fake-claude.mjs')
const fakeAgy = resolve(__dirname, 'fake-agy.mjs')

test('an agy agent whose office entry starts a removed program says so at the top of its chat, and Repair fixes agy\'s list only after Run', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-office-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const config = join(home, 'mcp_config.json')
  const plugins = join(home, 'plugins')
  const broken = { command: '/Applications/Agent World.app/Contents/MacOS/Agent World (gone)', args: ['/x/aw-mcp-bridge.cjs'] }
  writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': broken, StitchMCP: { command: '/no/such/thing', args: [] } } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, AW_AGY_PLUGINS: plugins, FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByRole('radio', { name: /agy/ }).check()
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    await page.getByRole('tab', { name: 'Chat' }).click()

    const strip = page.locator('.chat:visible .office-strip')
    await expect(strip).toContainText('ada cannot reach the office’s tools.')
    await expect(strip).toContainText('not installed')
    // Looking at it changes nothing; Repair shows the commands first, and still changes nothing.
    await strip.getByRole('button', { name: 'Repair' }).click()
    await expect(page.locator('.chat:visible .office-cmds')).toContainText('agy mcp remove agent-world')
    await expect(page.locator('.chat:visible .office-cmds')).toContainText('agy mcp add')
    expect(JSON.parse(readFileSync(config, 'utf8')).mcpServers['agent-world']).toEqual(broken)
    await strip.getByRole('button', { name: 'Run' }).click()
    await expect(strip).toContainText('restart ada to use them')
    // The office's entry now starts this build's bridge, and agy's other server was left alone.
    const list = JSON.parse(readFileSync(config, 'utf8')).mcpServers
    expect(list['agent-world'].args[0]).toMatch(/aw-mcp-bridge\.cjs$/)
    expect(list['agent-world'].command).not.toBe(broken.command)
    expect(Object.keys(list).sort()).toEqual(['StitchMCP', 'agent-world'])
    // Later puts the strip away.
    await strip.getByRole('button', { name: 'Later' }).click()
    await expect(page.locator('.chat:visible .office-strip')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
