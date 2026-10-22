import { execFileSync, spawn } from 'node:child_process'
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
  return { page, shutdown, home, folder }
}

async function hireAgy(page: import('@playwright/test').Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
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
    // The card offers agy's own answers, as its menu words them.
    await expect(ask.getByRole('button')).toContainText([/Yes, run command/, /always allow in this conversation/, /Persist to settings\.json/, /No, cancel/])
    await ask.getByRole('button', { name: 'Yes, run command' }).click()
    await expect(ask).toHaveCount(0, { timeout: 10_000 })
    // Choosing the first answer pressed "Yes, run command" in agy's own menu, so it ran and finished its turn.
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
    await expect(modal.locator('.st-card', { hasText: 'Tightest limit' })).toContainText('73% left')
    await expect(modal.locator('.st-card', { hasText: 'Tightest limit' })).toContainText('Gemini Models')
    await modal.getByRole('tab', { name: 'Providers' }).click()
    await expect(modal.getByRole('button', { name: 'Open agy (Antigravity)' })).toContainText('73%')
    await expect(modal.getByRole('button', { name: 'Open Claude Code' })).toBeVisible()
    await modal.getByRole('button', { name: 'Open agy (Antigravity)' }).click()
    await expect(modal.getByText('Gemini Models', { exact: true })).toBeVisible()
    await expect(modal.getByText('Claude and GPT models', { exact: true })).toBeVisible()
    await expect(modal.getByText('73% left', { exact: false }).first()).toBeVisible()
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
    await settings.getByRole('tab', { name: 'Message box' }).click()
    const box = settings.getByRole('tabpanel')
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
    const card = box.getByRole('group', { name: 'Connecting agy' })
    await expect(card).toContainText('Connected: agy')
    await expect(card.locator('[data-step="done"]')).toHaveCount(3)
    await expect(box.getByRole('button', { name: /Let agy .* message other agents/ })).toHaveCount(0)
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
    await expect(models.getByRole('menuitemradio', { name: /Gemini 3.1 Pro \(High\)/ })).toBeVisible()
    await expect(models.getByRole('menuitemradio', { name: /Fable|Haiku/ })).toHaveCount(0)
    await expect(models.getByRole('menuitemradio', { name: /Gemini 3.8 Flash \(High\)/ })).toHaveAttribute('aria-checked', 'true')
    // agy has no thinking setting of its own: its levels are different models, so no effort choice is offered.
    await expect(models.getByText('Effort', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Its modes are its own levels, skip permissions among them (as in the hire form), and a live switch goes through its Shift+Tab.
    await page.getByRole('button', { name: /^Ask first|Permission mode/ }).first().click()
    const modes = page.getByRole('menu', { name: 'Permission mode' })
    await expect(modes.getByRole('menuitemradio')).toHaveCount(4)
    await expect(modes.getByRole('menuitemradio', { name: /Skip permissions/ })).toHaveCount(1)
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

test('going back to an earlier message works on agy: the conversation shows only what came before, and the message is back in the box', async () => {
  const { page, shutdown } = await open('aw-agy-rewind-')
  try {
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    for (const words of ['first thing', 'second thing']) {
      await box.fill(words)
      await box.press('Enter')
      await expect(page.locator('.chat:visible').getByText(`echo: ${words}`)).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.agent-row', { hasText: 'ada' })).toHaveClass(/is-idle/, { timeout: 15_000 })
    }
    const msg = page.locator('.chat:visible .msg.user', { hasText: 'second thing' })
    await msg.hover()
    await msg.getByRole('button', { name: 'Rewind' }).click()
    // agy removed the later steps from its file: the chat starts over from what is left, and the message is waiting to be sent again.
    await expect(page.locator('.chat:visible').getByText('echo: second thing')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.chat:visible').getByText('echo: first thing')).toBeVisible()
    await expect(box).toHaveValue('second thing')
  } finally {
    await shutdown()
  }
})

test('agy counts in tokens: the agent shows what it holds and what it used, there is no Compact or Claude limit on it, and Usage totals them', async () => {
  const { page, shutdown } = await open('aw-agy-tokens-')
  try {
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('count these')
    await box.press('Enter')
    await expect(page.locator('.chat:visible').getByText('echo: count these')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Context and usage' }).click()
    const usage = page.getByRole('dialog', { name: 'Usage' })
    // Read 1000, written 50: the conversation holds about 1.1k tokens, and no price is shown.
    await expect(usage).toContainText('about 1.1k tokens', { timeout: 20_000 })
    await expect(usage).toContainText('1k read · 50 written')
    await expect(usage.getByRole('button', { name: 'Compact' })).toHaveCount(0)
    await expect(usage).not.toContainText('5-hour limit')
    await expect(usage).not.toContainText('$')
    await page.keyboard.press('Escape')

    await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    await expect(modal.locator('.st-card', { hasText: 'Tokens, 30 days' })).toContainText('1.1k', { timeout: 15_000 })
    await modal.getByRole('tab', { name: 'Providers' }).click()
    await modal.getByRole('button', { name: 'Open agy (Antigravity)' }).click()
    await expect(modal.getByText('1.1k').first()).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('a subagent agy starts is a colleague in the office while it works, listed with its role and answer, and leaves when it has answered', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-subs-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, FAKE_SUB_MS: '14000' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await hireAgy(page, 'ada')
    // The conversation has to have started before subagents can be told from its own file.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('hello')
    await box.press('Enter')
    await expect(page.locator('.chat:visible').getByText('echo: hello')).toBeVisible({ timeout: 15_000 })
    await box.fill('start a subagent to list the files')
    await box.press('Enter')

    const seats = async () => JSON.parse((await page.locator('.stage').getAttribute('data-crew')) ?? '[]') as unknown[]
    await expect.poll(async () => (await seats()).length, { timeout: 20_000 }).toBe(1)
    await expect(page.getByRole('button', { name: '1 subagent working' })).toBeVisible({ timeout: 20_000 })
    // In the conversation it is the same delegation card as for Claude Code, not a raw tool call.
    await expect(page.locator('.chat:visible').getByRole('region', { name: 'Delegated to 1 subagent' })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.chat:visible').getByText('invoke_subagent')).toHaveCount(0)
    await page.getByRole('button', { name: '1 subagent working' }).click()
    const panel = page.getByRole('dialog', { name: 'Subagents' })
    await expect(panel).toContainText('research')
    await page.keyboard.press('Escape')

    // It answers: the colleague leaves, and what it said is kept.
    await expect.poll(async () => (await seats()).length, { timeout: 30_000 }).toBe(0)
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const subs = await page.evaluate((id) => window.aw.subagents(id), ada!.id)
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ type: 'research', description: 'File Researcher', done: true, result: 'The folder is empty.' })
    expect(subs[0]!.calls.map((c) => c.detail)).toEqual(['ls -la'])
  } finally {
    await shutdown()
  }
})

test('what agy does not have is not offered: no role change, Compact, budget or Chrome, and its own handbook and commands show instead', async () => {
  const { page, shutdown, folder } = await open('aw-agy-gating-')
  try {
    // The Handbook belongs to an agent with a branch, so the project is a git repository.
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: folder })
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'init')
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await expect(form.getByLabel('Budget (USD)')).toBeVisible()
    await form.getByRole('radio', { name: /agy/ }).check()
    await expect(form.getByLabel('Budget (USD)')).toHaveCount(0)
    await expect(form.getByText('Let it use Chrome')).toHaveCount(0)
    await form.getByRole('radio', { name: /Claude Code/ }).check()
    await expect(form.getByLabel('Budget (USD)')).toBeVisible()
    await form.getByRole('radio', { name: /agy/ }).check()
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })

    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('menu', { name: 'More actions' })
    await expect(menu.getByRole('menuitem', { name: /Clone/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Change role/ })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: /Handbook/ })).toContainText('AGENTS.md')
    await expect(menu.getByRole('menuitem', { name: /Tools/ })).toBeVisible()
    await page.keyboard.press('Escape')

    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const names = (await page.evaluate((id) => window.aw.listCommands(id), ada!.id)).map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['context', 'rewind', 'fork']))
    expect(names).not.toContain('compact')
    expect(names).not.toContain('cost')
  } finally {
    await shutdown()
  }
})

test('a clone of an agy agent branches its conversation and has the history, and a /btw side question answers in the chat', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-clone-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: folder })
  git('init', '-q', '-b', 'main')
  git('commit', '-q', '--allow-empty', '-m', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, FAKE_DELAY_MS: '300' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('first thing')
    await box.press('Enter')
    await expect(page.locator('.chat:visible').getByText('echo: first thing')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.agent-row', { hasText: 'ada' })).toHaveClass(/is-idle/, { timeout: 15_000 })

    // A side question is answered in a card, and the agent stays free.
    await box.fill('/btw what is it')
    await box.press('Enter')
    const card = page.locator('.chat:visible .btw')
    await expect(card).toContainText('the answer to: what is it', { timeout: 15_000 })
    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(card).toHaveCount(0, { timeout: 10_000 })

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /Clone/ }).click()
    await page.getByRole('menuitem', { name: 'Same model' }).click()
    await expect(page.locator('.roster button')).toHaveCount(2)
    const [ada, copy] = await page.evaluate(() => window.aw.listAgents())
    expect(copy!.forkOf).toBe(ada!.sessionId)
    // It branched what it opened: a conversation of its own, with the history in it.
    await expect.poll(async () => (await page.evaluate(() => window.aw.listAgents()))[1]!.sessionId, { timeout: 30_000 }).not.toBe(copy!.sessionId)
    const mine = (await page.evaluate(() => window.aw.listAgents()))[1]!.sessionId
    expect(mine).not.toBe(ada!.sessionId)
    await page.locator('.roster button', { hasText: copy!.name }).click()
    await expect(page.locator('.chat:visible').getByText('echo: first thing')).toBeVisible({ timeout: 20_000 })
  } finally {
    await shutdown()
  }
})

test('an entry agy still lists for a removed build can be taken out from Settings, and nothing else of agy\'s list is touched', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-agy-stale-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const config = join(home, 'mcp_config.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world-2': { command: '/Applications/Agent World 2.app/Contents/MacOS/Agent World 2', args: ['/x/aw-mcp-bridge.cjs'] }, StitchMCP: { command: '/no/such/thing', args: [] } } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Message box' }).click()
    const box = settings.getByRole('tabpanel')
    // It says which entry, and why agy fails on it.
    const stale = box.getByRole('alert').filter({ hasText: 'agent-world-2' })
    await expect(stale).toContainText('not installed')
    await expect(stale).toContainText('Agent World 2.app')
    // Only the one that is ours and left behind is offered; agy's other servers are not.
    await expect(box.getByRole('alert')).toHaveCount(1)
    await stale.getByRole('button', { name: 'Remove agent-world-2' }).click()
    await expect(box.getByRole('alert')).toHaveCount(0)
    await expect(box.getByRole('status').filter({ hasText: 'Removed agent-world-2' })).toBeVisible()
    expect(Object.keys(JSON.parse(readFileSync(config, 'utf8')).mcpServers)).toEqual(['StitchMCP'])
  } finally {
    await shutdown()
  }
})
