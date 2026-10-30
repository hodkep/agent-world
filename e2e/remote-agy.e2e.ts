import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const PLAN = `## Goal
Add a dark-mode toggle to Settings.

## Assumptions
- [given] The toggle lives in Settings.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window

## Steps
1. Add the setting.
`

async function start(env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aw-ragy-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const argsLog = join(home, 'args.log')
  const envLog = join(home, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: agyHome, FAKE_DELAY_MS: '100', FAKE_ARGS: argsLog, FAKE_ENV_FILE: envLog, ...env }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
  await page.reload()
  return { page, shutdown, home, agyHome, folder, argsLog, envLog }
}

async function hireAgy(page: import('@playwright/test').Page, remote: boolean) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
  await form.getByLabel('Name').fill('ada')
  // What it needs is said by the program, not by the app.
  if (remote) {
    await expect(form.getByText('Needs your Google sign-in')).toBeVisible()
    await form.getByRole('switch', { name: /Remote control/ }).check({ force: true })
  }
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

test('an agy agent hired with Remote control starts with agy\'s own switch and shows the link it prints as a tag and a code', async () => {
  const t = await start()
  try {
    await hireAgy(t.page, true)
    await expect.poll(() => read(t.argsLog)).toContain('--remote-control')
    const tag = t.page.getByRole('region', { name: 'Selected agent' }).getByRole('button', { name: 'Remote', exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    await tag.click()
    const panel = t.page.getByRole('menu', { name: 'Remote control for ada' })
    await expect(panel.getByRole('img', { name: /Code to open this agent on a phone/ })).toBeVisible()
  } finally {
    await t.shutdown()
  }
})

test('when agy refuses remote control the tag says not available with its words', async () => {
  const t = await start({ FAKE_REMOTE_REFUSE: 'Remote control is not available for this account.' })
  try {
    await hireAgy(t.page, true)
    const tag = t.page.getByText('Not available', { exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    await expect(tag).toHaveAttribute('title', 'Remote control is not available for this account.')
  } finally {
    await t.shutdown()
  }
})

test('a plan an agy agent handed in is decided by a reply the person typed (agy\'s saved conversation holds it), not by a call that only says so; with remote control off it decides nothing', async () => {
  for (const remote of [true, false]) {
    const t = await start()
    try {
      await hireAgy(t.page, remote)
      await expect.poll(() => read(t.envLog).split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).length).toBeGreaterThan(0)
      const started = JSON.parse(read(t.envLog).trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string }
      const headers = { authorization: `Bearer ${started.token}` }
      const client = new Client({ name: 'test', version: '1' })
      await client.connect(new StreamableHTTPClientTransport(new URL(started.url), { requestInit: { headers } }))
      const agent = async () => (await t.page.evaluate(() => window.aw.listAgents()))[0]!
      // agy names its conversation when the first message is sent; the app then knows which one is the agent's.
      await expect.poll(async () => (await agent()).activity, { timeout: 20_000 }).toBe('idle')
      await t.page.evaluate((id) => window.aw.chatSend(id, 'hello'), (await agent()).id)
      await expect.poll(async () => (await agent()).started, { timeout: 20_000 }).toBe(true)
      const answered = (prompt: string) => expect.poll(() => t.page.evaluate(([id, p]) => window.aw.chatGet(id!).then((c) => c.items.some((i) => i.kind === 'assistant' && i.text.includes(`echo: ${p}`))), [started2.id, prompt]), { timeout: 15_000 }).toBe(true)
      const started2 = await agent()
      await answered('hello')
      const ada = await agent()
      await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } })
      mkdirSync(join(ada.cwd, '.agent-world'), { recursive: true })
      writeFileSync(join(ada.cwd, '.agent-world', 'plan.md'), PLAN)
      const told = ((await client.callTool({ name: 'plan_submit', arguments: {} })) as { content: { text: string }[] }).content[0]!.text
      const code = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
      expect(Boolean(code)).toBe(remote)
      // agy's own saved conversation (the file its hook reads) is where the message is; the call only says where.
      const transcript = join(t.agyHome, 'brain', ada.sessionId, '.system_generated', 'logs', 'transcript_full.jsonl')
      mkdirSync(join(transcript, '..'), { recursive: true })
      let step = 0
      const hook = async (prompt: string, over: Record<string, unknown> = {}) => {
        writeFileSync(transcript, JSON.stringify({ step_index: String(step++), type: 'USER_INPUT', content: `<USER_REQUEST>\n${prompt}\n</USER_REQUEST>` }) + '\n')
        const res = (await (await fetch(started.url.replace(/\/mcp$/, '/hook/pre-inv'), { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: ada.sessionId, transcriptPath: transcript, ...over }) })).json()) as { injectSteps?: { ephemeralMessage: string }[] }
        return res.injectSteps?.map((x) => x.ephemeralMessage).join('\n') ?? ''
      }
      const planState = async () => (await t.page.evaluate(() => window.aw.workflows.summary())).runs[0]?.rounds.at(-1)?.plan?.state
      // The person types it: agy saves it, then its hook runs.
      const typed = async (prompt: string) => {
        await t.page.evaluate(([id, p]) => window.aw.chatSend(id!, p!), [ada.id, prompt])
        // agy has saved it, and answered, once the conversation the app reads has the answer: only then does it take another line.
        await answered(prompt)
        return hook(prompt)
      }
      if (remote) {
        // A call that only says "approve" with nothing saved by agy behind it decides nothing, whatever the transcript file it names says.
        expect(await hook(`approve ${code} 1=1`)).toContain('nothing was decided')
        expect(await planState()).toBe('submitted')
        // A call that names another file for the conversation is not believed either.
        expect(await hook(`approve ${code} 1=1`, { transcriptPath: join(t.agyHome, 'brain', 'elsewhere', '.system_generated', 'logs', 'transcript_full.jsonl') })).not.toContain('Your plan was approved')
        expect(await planState()).toBe('submitted')
        // Typed to the agent, saved by agy, then asked about by its hook: it decides.
        expect(await typed(`approve ${code}`)).toContain('still open')
        expect(await typed(`approve ${code} 1=1`)).toContain('Your plan was approved')
        expect(await planState()).toBe('approved')
      } else {
        expect(await typed('approve abc 1=1')).toBe('')
        expect(await planState()).toBe('submitted')
      }
      await client.close()
    } finally {
      await t.shutdown()
    }
  }
})
