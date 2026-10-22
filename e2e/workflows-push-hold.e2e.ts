import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'Saved in localStorage.' }] })

const PULL = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }

async function office(name: string, findings = FINDINGS, remote = false) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true } }))
  const envFile = join(tmp, 'env.log')
  const argsLog = join(tmp, 'args.log')
  const contextLog = join(tmp, 'context.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_AUDIT: findings, FAKE_ARGS: argsLog, FAKE_PROMPT_HOOK: '1', FAKE_CONTEXT_LOG: contextLog }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  if (remote) await page.evaluate((f) => window.aw.addAgent(f, { remote: true }, 'ada'), repo)
  else await hire(page, { name: 'ada' })
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  await expect.poll(() => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
  const env = JSON.parse(readFileSync(envFile, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string; git: Record<string, string> }
  // git as the agent's own processes run it: the environment the app started the agent with.
  const asAgent = (cwd: string, ...args: string[]) =>
    new Promise<{ ok: boolean; out: string }>((done) =>
      execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
    )
  // The agent's task, with its plan approved, and one commit on its branch.
  const log = join(home, 'runs.jsonl')
  const t = Date.now()
  appendFileSync(log, [
    { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle', workflow: PULL },
    { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
    { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
  git(ada!.cwd, 'add', '-A')
  git(ada!.cwd, 'commit', '-qm', 'add toggle')
  const remoteDir = join(tmp, 'remote.git')
  git(tmp, 'init', '-q', '--bare', remoteDir)
  git(repo, 'remote', 'add', 'origin', remoteDir)
  const push = (...extra: string[]) => asAgent(ada!.cwd, 'push', ...extra, 'origin', ada!.branch!)
  const merge = () => asAgent(repo, 'merge', '--ff-only', ada!.branch!)
  const pushed = () => git(remoteDir, 'branch', '--list', ada!.branch!)
  const landed = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.landed as { how: string; held: string[] } | undefined
  // What the person types goes to the agent's program, which reports it to the office from its own process, as Claude does; the office's answer is what the program kept.
  const kept = () => (existsSync(contextLog) ? readFileSync(contextLog, 'utf8') : '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { prompt?: string; context?: string })
  const reply = async (prompt: string) => {
    const before = kept().length
    await page.evaluate(([id, p]) => window.aw.chatSend(id!, p!), [ada!.id, prompt])
    await expect.poll(() => kept().length, { timeout: 15_000 }).toBeGreaterThan(before)
    return kept().slice(before).find((k) => k.prompt === prompt)?.context ?? ''
  }
  return { repo, home, git, page, ada: ada!, shutdown, merge, push, pushed, landed, reply }
}

test('an agent that pushes its branch from the chat is held by git itself while the review has findings the person has not seen, and the push goes through once the person allows it, which ends the run', async () => {
  const o = await office('wfpush')
  try {
    // The review has not run: the push is refused in the office's words, and the review starts.
    const first = await o.push()
    expect(first.ok).toBe(false)
    expect(first.out).toContain('Agent World: this push is held. Not yet: The review has not run for this branch yet.')
    expect(o.pushed()).toBe('')
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await expect.poll(() => o.page.evaluate(() => window.aw.landingHolds())).toEqual([expect.objectContaining({ agentId: o.ada.id, held: ['2 audit findings have not been seen.'] })])
    expect(o.pushed()).toBe('')
    expect(await o.landed()).toBeUndefined()
    // The agent cannot allow it; the person does, and the next push goes through and the run ends there, logged as pushed anyway.
    await o.page.evaluate((id) => window.aw.landingAllow(id), o.ada.id)
    expect((await o.push()).ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
    await expect.poll(o.landed).toMatchObject({ how: 'anyway', held: ['2 audit findings have not been seen.'] })
    // The push ended the run, as the agent is told it does.
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.workflows.summary())).runs[0]!.status).toBe('done')
    expect(await o.page.evaluate(() => window.aw.landingHolds())).toEqual([])
  } finally {
    await o.shutdown()
  }
})

test('the same push goes through with no say from the person once the findings were seen, and the base branch is not held for a run that ends in a pull request', async () => {
  const o = await office('wfpush2')
  try {
    await o.push()
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await o.page.evaluate((id) => window.aw.finishSeen(id, [0, 1]), o.ada.id)
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'checked', held: [] })
    // Moving main is GitHub's once the pull request is merged there: git does not ask the office about it for this run.
    const m = await o.merge()
    expect(m.out).not.toContain('Agent World')
  } finally {
    await o.shutdown()
  }
})

test('a held push shows in the chat as a card that says the push is held, and Set aside lifts it and records the audit as not followed', async () => {
  const o = await office('wfpush3')
  try {
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.push()
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    const card = o.page.getByRole('region', { name: "ada's push is held" })
    await expect(card).toBeVisible()
    await expect(card).toContainText('PUSH HELD')
    await expect(card).toContainText('1 thing holds the push')
    await expect(o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).first().getByText('Push held', { exact: true })).toBeVisible()
    // The agent's Workflow tab says the push too, and the pill beside the agent is not "land".
    await o.page.getByRole('tab', { name: /^Workflow/ }).click()
    await expect(o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).last()).toContainText('Push held')
    await expect(o.page.getByText('Land held')).toHaveCount(0)
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await card.getByRole('button', { name: 'Set aside' }).click()
    await expect(card).toHaveCount(0)
    await expect(o.page.getByRole('note', { name: "ada's audit, set aside" })).toContainText('You set the audit aside · 2 things not looked at')
    expect((await o.push()).ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
    // Set aside is not a clean pass: the push is recorded as anyway, naming the review.
    await expect.poll(o.landed).toMatchObject({ how: 'anyway', held: ['The review was set aside.'] })
  } finally {
    await o.shutdown()
  }
})

test('a push that skips the hold with --no-verify cannot be stopped, but the run records it as pushed anyway, saying so, and a push the office let through is recorded once', async () => {
  const o = await office('wfpush4')
  try {
    expect((await o.push('--no-verify')).ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
    await expect.poll(o.landed).toMatchObject({ how: 'anyway' })
    const landed = (await o.landed())!
    expect(landed.held).toContain('Pushed without the hold: git push --no-verify.')
    expect(landed.held.length).toBeGreaterThan(1)
  } finally {
    await o.shutdown()
  }
})

test('a push the person had allowed is recorded once, as pushed anyway with what held it and without the skipped-hold line', async () => {
  const o = await office('wfpush5')
  try {
    await o.push()
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await o.page.evaluate((id) => window.aw.landingAllow(id), o.ada.id)
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'anyway', held: ['2 audit findings have not been seen.'] })
  } finally {
    await o.shutdown()
  }
})

test('findings arrive grouped, one row for one cause with its files: Add to plan keeps an out-of-scope cause in scope for later audits and counts it as seen, Seen, fine answers the rest', async () => {
  const grouped = JSON.stringify({ findings: [{ kind: 'out-of-scope', files: ['src/code/a.ts', 'src/code/b.ts', 'src/code/c.ts'], text: 'The fold feature.' }, { kind: 'goal-unmet', text: 'No test for a 5-digit line count.' }] })
  const o = await office('wffind', grouped)
  try {
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.page.evaluate((id) => window.aw.finishAudit(id), o.ada.id)
    const card = o.page.getByRole('region', { name: "ada's audit" })
    await expect(card).toBeVisible({ timeout: 20_000 })
    const row = card.getByRole('listitem').filter({ hasText: 'The fold feature.' })
    await expect(row).toContainText('out of scope · 3 files')
    await row.getByRole('button', { name: 'show files' }).click()
    await expect(row).toContainText('src/code/a.ts, src/code/b.ts, src/code/c.ts')
    // Only out-of-scope work can be added to the plan.
    await expect(card.getByRole('listitem').filter({ hasText: 'No test for a 5-digit line count.' }).getByRole('button', { name: 'Add to plan' })).toHaveCount(0)
    await row.getByRole('button', { name: 'Add to plan' }).click()
    await expect(row).toHaveCount(0)
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.workflows.summary())).runs[0]!.additions?.map((a) => a.text)).toEqual(['The fold feature.'])
    await card.getByRole('button', { name: 'Seen, fine', exact: true }).click()
    await expect(card).toHaveCount(0)
  } finally {
    await o.shutdown()
  }
})

test('a push of finished work is held by that work\'s own run, not by a task begun since: its approved plan and passed audit stand, and the new task\'s missing plan does not hold it', async () => {
  const o = await office('wfowner', JSON.stringify({ findings: [] }))
  try {
    const log = join(o.home, 'runs.jsonl')
    const head = o.git(o.ada.cwd, 'rev-parse', 'HEAD')
    const t = Date.now()
    // The first task is finished and audited with nothing found; a second one was begun before its branch was pushed, and has no plan.
    appendFileSync(log, [
      { k: 'commit', t: t - 2500, run: 'r1', round: 1, sha: head, subject: 'add toggle' },
      { k: 'audit', t: t - 2000, run: 'r1', head, state: 'done', findings: [], files: 1, lines: 1, truncated: false },
      { k: 'done', t: t - 1500, run: 'r1' },
      { k: 'begin', t: t - 1000, run: 'r2', agent: o.ada.id, name: 'ada', project: o.repo, title: 'A second task', workflow: PULL }
    ].map((e) => JSON.stringify(e)).join('\n') + '\n')
    const r = await o.push()
    expect(r.out).not.toContain('this push is held')
    expect(r.ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
  } finally {
    await o.shutdown()
  }
})

test('with remote control on, the held push names its codes, and the person lets it through by typing the word and code', async () => {
  const o = await office('wfpushr', FINDINGS, true)
  try {
    await o.push()
    // Once the review's findings are in, the refusal the agent reads has the two things waiting and how to answer each.
    const out = await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.').then(async () => (await o.push()).out)
    const audit = /`seen ([a-z0-9]{3})`/.exec(out)?.[1]
    const push = /`allow ([a-z0-9]{3})`/.exec(out)?.[1]
    expect(audit).toBeTruthy()
    expect(push).toBeTruthy()
    expect(out).toContain('or `decline')
    // A word that the push does not take is told so, and nothing changes; neither does a code that waits for nothing.
    expect(await o.reply(`approve ${push}`)).toContain('does not take "approve"')
    expect(await o.reply('allow abc')).toBe('')
    expect((await o.push()).ok).toBe(false)
    // Seeing the findings by typing lets the push through, as the card's button does.
    expect(await o.reply(`seen ${audit}`)).toContain('seen')
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'checked', held: [] })
  } finally {
    await o.shutdown()
  }
})

test('with remote control on, typing allow and the code lets a held push through anyway, and "decline" keeps it held', async () => {
  const o = await office('wfpushr2', FINDINGS, true)
  try {
    await o.push()
    const out = await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.').then(async () => (await o.push()).out)
    const push = /`allow ([a-z0-9]{3})`/.exec(out)?.[1]!
    expect(await o.reply(`decline ${push}`)).toContain('not yet')
    await expect.poll(() => o.page.evaluate(() => window.aw.landingHolds())).toEqual([expect.objectContaining({ declined: true })])
    expect((await o.push()).ok).toBe(false)
    // The agent trying again and being held again brings the decision back, with the same code.
    const again = /`allow ([a-z0-9]{3})`/.exec((await o.push()).out)?.[1]
    expect(again).toBe(push)
    expect(await o.reply(`allow ${again}`)).toContain('push again')
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'anyway' })
  } finally {
    await o.shutdown()
  }
})

test('with remote control off the push refusal says nothing of codes, and typed words decide nothing', async () => {
  const o = await office('wfpushr3')
  try {
    await o.push()
    const out = await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.').then(async () => (await o.push()).out)
    expect(out).not.toContain('remote control')
    expect(out).not.toMatch(/allow [a-z0-9]{3}/)
    expect(await o.reply('allow abc')).toBe('')
    expect((await o.push()).ok).toBe(false)
  } finally {
    await o.shutdown()
  }
})

test('with remote control on, the audit findings are answered by typing: only out-of-scope work can be added to the plan, and setting the review aside lets the push through', async () => {
  const o = await office('wfpushr4', FINDINGS, true)
  try {
    await o.push()
    const out = await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.').then(async () => (await o.push()).out)
    const audit = /`seen ([a-z0-9]{3})`/.exec(out)?.[1]!
    expect(await o.reply(`plan ${audit} 2`)).toContain('Only out-of-scope work can be added to the plan')
    expect(await o.reply(`seen ${audit} 9`)).toContain('must be findings of the audit')
    expect(await o.reply(`plan ${audit} 1`)).toContain('added those findings to the plan')
    // One finding is still unseen, so the push is still held, and the audit has the same code until it is all seen or set aside.
    expect((await o.push()).ok).toBe(false)
    expect(await o.reply(`aside ${audit}`)).toContain('set the audit aside')
    expect((await o.push()).ok).toBe(true)
  } finally {
    await o.shutdown()
  }
})
