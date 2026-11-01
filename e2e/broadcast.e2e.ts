import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'
import { readLog } from './readLog'

test('a broadcast reaches every other agent at once: the sender\'s card lists who got it, and each recipient\'s card says who else was told', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-broadcast-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.evaluate(async (f) => {
      await window.aw.addAgent(f, {}, 'ada')
      await window.aw.addAgent(f, {}, 'linus')
      await window.aw.addAgent(f, {}, 'grace')
    }, repo)
    // The window learns of agents added by the API when it is drawn again; traces are kept from then on, so this comes before the broadcast.
    await page.reload()
    await expect.poll(() => readLog(argsLog).split('\n').filter((l) => l.startsWith('[') && l.includes('--mcp-config')).length).toBe(3)
    // The first agent started is ada: its own token is the sender's identity on the office server.
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcpCfg = JSON.parse(readFileSync(launch[launch.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const names = await client.listTools().then((t) => t.tools.map((x) => x.name))
    expect(names).toContain('broadcast_message')
    // Who is the sender is whichever agent that token belongs to; its answer lists the two others, each delivered or queued (busy), never itself.
    const answer = ((await client.callTool({ name: 'broadcast_message', arguments: { message: 'Main moved to 0.9.4: rebase please.' } })) as { content: { text: string }[] }).content[0]!.text
    expect(answer).toMatch(/^Broadcast to 2 agents \(id [^)]+\):/)
    expect(answer.match(/: (delivered|queued)/g)).toHaveLength(2)
    expect(answer).toContain('Replies arrive as messages')
    const sender = ['ada', 'linus', 'grace'].find((n) => !answer.includes(`${n}:`))!
    const other = ['ada', 'linus', 'grace'].find((n) => n !== sender && answer.includes(`${n}:`))!

    const open = async (name: string) => {
      await page.getByText(name, { exact: true }).first().click()
      await page.getByRole('tab', { name: 'Chat' }).click()
      return page.getByRole('log', { name: `Conversation with ${name}` })
    }
    // The recipient's chat: a broadcast card, not a bubble, saying who else got it and that the reply goes to the sender.
    const there = await open(other)
    const card = there.getByRole('article', { name: `Broadcast from agent ${sender}` })
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card.locator('.mail-tag')).toHaveText('Broadcast')
    await expect(card).toContainText('Main moved to 0.9.4: rebase please.')
    await expect(card).toContainText('also sent to:')
    await expect(card).toContainText(`reply to “${sender}” only`)
    await expect(there.locator('.msg.user')).toHaveCount(0)
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/broadcast-received.png` })
    // Traces: one card for the whole broadcast, a line for each agent it went to.
    await page.getByRole('tab', { name: /^Traces/ }).click()
    const trace = page.locator('.traces .tcard').first()
    await expect(trace.locator('.tc-tag')).toHaveText('Broadcast')
    await expect(trace.locator('.trace-who')).toHaveText(`${sender} → 2 agents`)
    await expect(trace.locator('.bc-row')).toHaveCount(2)
    await expect(trace).toContainText('Main moved to 0.9.4: rebase please.')
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/broadcast-traces.png` })
    await client.close()
  } finally {
    await shutdown()
  }
})
