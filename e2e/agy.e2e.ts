import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

// A file the fake writes when it starts: not there yet is just "nothing yet" while polling.
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const fakeClaude = resolve(__dirname, 'fake-claude.mjs')
const fakeAgy = resolve(__dirname, 'fake-agy.mjs')

async function open(prefix: string) {
  const home = mkdtempSync(join(tmpdir(), prefix))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, FAKE_DELAY_MS: '600' }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
  await page.reload()
  return { page, shutdown, home }
}

async function hireAgy(page: import('@playwright/test').Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByLabel('Provider').selectOption('agy')
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

test('an agy agent is hired beside Claude, shows its provider, and its conversation reaches the chat', async () => {
  const { page, shutdown, home } = await open('aw-agy-')
  try {
    await hireAgy(page, 'ada')
    // The program is a colour square, named on hover.
    await expect(page.locator('.agent-row', { hasText: 'ada' }).getByRole('img', { name: 'agy (Antigravity)' })).toBeVisible()
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0]).toMatchObject({ name: 'ada', provider: 'agy' })

    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('hello there')
    await box.press('Enter')
    await expect(page.locator('.chat').getByText('echo: hello there')).toBeVisible({ timeout: 15_000 })
    // The conversation the app now resumes by is the one agy named, not the id the app made up.
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0].sessionId).toMatch(/^[0-9a-f-]{36}$/)
    const history = readFileSync(join(home, 'agy', 'history.jsonl'), 'utf8')
    const conv = JSON.parse(history.trim().split('\n')[0]!).conversationId
    expect(JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0].sessionId).toBe(conv)
  } finally {
    await shutdown()
  }
})

test('a permission agy asks for shows as a card in the office, and allowing it carries on', async () => {
  const { page, shutdown } = await open('aw-agy-perm-')
  try {
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('ask permission please')
    await box.press('Enter')
    const ask = page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(ask).toContainText('touch note.txt', { timeout: 15_000 })
    await ask.getByRole('button', { name: 'Allow' }).click()
    await expect(ask).toHaveCount(0, { timeout: 10_000 })
    // Allowing pressed "Yes, run command" in agy's own menu, so it ran and finished its turn.
    await expect(page.locator('.agent-row', { hasText: 'ada' })).toHaveClass(/is-idle/, { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('Usage opens on one summary across providers, and a provider row opens its own limits', async () => {
  const { page, shutdown } = await open('aw-agy-usage-')
  try {
    await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    // The busiest limit is the one with least left, whichever provider it belongs to.
    await expect(modal.locator('.st-card', { hasText: 'Busiest limit' })).toContainText('73% left')
    await expect(modal.locator('.st-card', { hasText: 'Busiest limit' })).toContainText('Gemini Models')
    await expect(modal.getByRole('button', { name: 'Open agy (Antigravity)' })).toContainText('73%')
    await expect(modal.getByRole('button', { name: 'Open Claude Code' })).toBeVisible()
    await modal.getByRole('button', { name: 'Open agy (Antigravity)' }).click()
    await expect(modal.getByText('Gemini Models', { exact: true })).toBeVisible()
    await expect(modal.getByText('Claude and GPT models', { exact: true })).toBeVisible()
    await expect(modal.getByText('73% left', { exact: false }).first()).toBeVisible()
    await expect(modal.getByText(/no price/)).toBeVisible()
    await modal.getByRole('button', { name: '‹ All providers' }).click()
    await expect(modal.getByRole('button', { name: 'Open agy (Antigravity)' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('agy is connected to the message box only after its change is shown and approved, and then its agents reach the office through it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-mail-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const config = join(home, 'mcp_config.json')
  const envFile = join(home, 'env.log')
  const argsFile = join(home, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, FAKE_ENV_FILE: envFile, FAKE_ARGS: argsFile, FAKE_DELAY_MS: '300' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    const box = settings.locator('fieldset', { hasText: 'Message box' })
    await box.getByRole('button', { name: /Let agy .* message other agents/ }).click()
    // The exact change is on screen before anything is written.
    const plan = box.getByRole('group', { name: /Connect agy/ })
    await expect(plan).toContainText('agy mcp add --env ELECTRON_RUN_AS_NODE=1 agent-world --')
    await expect(plan).toContainText('aw-mcp-bridge.cjs')
    expect(existsSync(config)).toBe(false)
    await plan.getByRole('button', { name: 'Not now' }).click()
    expect(existsSync(config)).toBe(false)

    await box.getByRole('button', { name: /Let agy/ }).click()
    await plan.getByRole('button', { name: 'Connect' }).click()
    await expect(box.getByText('Its agents can message the others')).toBeVisible()
    expect(Object.keys(JSON.parse(readFileSync(config, 'utf8')).mcpServers)).toEqual(['agent-world'])
    expect(existsSync(join(home, 'aw', 'bin', 'aw-mcp-bridge.cjs'))).toBe(true)
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // An agy agent now starts with the identity the bridge needs, and is told about the message box.
    await hireAgy(page, 'ada')
    await expect.poll(() => read(envFile)).toMatch(/"token":"[0-9a-f]{48}"/)
    const started = JSON.parse(readFileSync(envFile, 'utf8').trim().split('\n').at(-1)!)
    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    await expect.poll(() => read(argsFile)).toContain('recall tool')

    // What agy would do: start the bridge with that environment and ask the office who is there.
    const reply = await new Promise<string>((resolve, reject) => {
      const p = spawn(process.execPath, [join(home, 'aw', 'bin', 'aw-mcp-bridge.cjs')], { env: { ...process.env, AW_MCP_URL: started.url, AW_AGENT_TOKEN: started.token } })
      let out = ''
      p.stdout.on('data', (d) => {
        out += d
        if (out.includes('\n')) (p.kill(), resolve(out))
      })
      p.on('error', reject)
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_agents', arguments: {} } }) + '\n')
    })
    expect(JSON.parse(reply).result.content[0].text).toContain('"you":true')
  } finally {
    await shutdown()
  }
})

test('an agy agent\'s controls show its own model and modes, and switching mode presses the key agy uses', async () => {
  const { page, shutdown } = await open('aw-agy-controls-')
  try {
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    // The model comes from agy's own footer: there are no statistics to report it.
    const chip = page.getByRole('button', { name: 'Model and effort' })
    await expect(chip).toContainText('Gemini 3.8 Flash', { timeout: 15_000 })
    await expect(chip).toContainText('high')
    await chip.click()
    const models = page.getByRole('menu', { name: 'Model and effort' })
    await expect(models.getByRole('menuitemradio', { name: /Gemini 3.1 Pro/ })).toBeVisible()
    await expect(models.getByRole('menuitemradio', { name: /Fable|Haiku/ })).toHaveCount(0)
    await expect(models.getByRole('menuitemradio', { name: /Gemini 3.8 Flash/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    // Its modes are its own levels (no bypass offered), and a live switch goes through its Shift+Tab.
    await page.getByRole('button', { name: /^Ask first|Permission mode/ }).first().click()
    const modes = page.getByRole('menu', { name: 'Permission mode' })
    await expect(modes.getByRole('menuitemradio')).toHaveCount(3)
    await expect(modes.getByRole('menuitemradio', { name: /Bypass/ })).toHaveCount(0)
    await modes.getByRole('menuitemradio', { name: /Plan/ }).click()
    await expect(page.getByRole('button', { name: /^Plan/ }).first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('the Tools tab of an agy agent lists what agy has connected without showing the keys on its command lines, and removes a server through agy', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-tools-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const config = join(home, 'mcp_config.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { payments: { command: 'npx', args: ['-y', '@pay/mcp', '--api-key=sk_test_SECRET456'] }, notes: { command: 'notes-server', args: [] } } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Tools' }).click()
    const row = page.locator('.tools li', { hasText: 'payments' })
    await expect(row).toContainText('npx (arguments hidden)')
    await expect(page.locator('.tools')).not.toContainText('SECRET456')
    await expect(page.locator('.tools')).not.toContainText('--api-key')
    await expect(page.locator('.tools li', { hasText: 'notes' })).toContainText('notes-server')
    await row.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('button', { name: 'Sure?' }).click()
    await expect(page.locator('.tools li', { hasText: 'payments' })).toHaveCount(0, { timeout: 10_000 })
    expect(Object.keys(JSON.parse(readFileSync(config, 'utf8')).mcpServers)).toEqual(['notes'])
  } finally {
    await shutdown()
  }
})
