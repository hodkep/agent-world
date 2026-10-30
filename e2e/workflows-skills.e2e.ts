import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const SKILLED = {
  version: 1,
  id: 'skilled',
  name: 'Skilled',
  when: 'Changes that follow our review habits.',
  steps: [
    { id: 'fix', kind: 'work', name: 'Fix', skills: ['tdd', 'deploy-notes'], brief: 'Make the change.' },
    { id: 'review', kind: 'work', name: 'Review', skills: ['code-review'] },
    { id: 'land', kind: 'merge' }
  ]
}
const PLAIN = { version: 1, id: 'plain', name: 'Plain', steps: [{ id: 'fix', kind: 'work', skills: ['tdd'] }, { id: 'land', kind: 'merge' }] }

async function start() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-skills-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
  writeFileSync(join(repo, '.agent-world', 'workflows', 'skilled.json'), JSON.stringify(SKILLED))
  writeFileSync(join(repo, '.agent-world', 'workflows', 'plain.json'), JSON.stringify(PLAIN))
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  // The library holds two skills and an instruction; the project's playbook switches on only tdd.
  for (const [id, what] of [['tdd', 'Write the failing test first.'], ['code-review', 'Review a diff against our standards.']] as const) {
    mkdirSync(join(home, 'library', 'skills', id), { recursive: true })
    writeFileSync(join(home, 'library', 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: ${what}\n---\nBody of ${id}.`)
  }
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: { [repo]: 'skilled' } } }))
  const argsLog = join(tmp, 'args.log')
  const app = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  const page = await app.app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await page.evaluate((f) => window.aw.library.setPlaybook(f, [{ id: 'tdd', mode: 'on-demand', when: 'writing code', strength: 'soft' }]), repo)
  return { ...app, page, repo, argsLog }
}

// The fake writes the log when the first agent starts, which on a slow machine is after the first look: no file yet is no launches yet.
const launches = (argsLog: string) => readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).filter((a) => a.includes('--settings'))
const flag = (launch: string[], f: string) => launch[launch.indexOf(f) + 1]!
async function asAgent(launch: string[]) {
  const cfg = JSON.parse(readFileSync(flag(launch, '--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
    return { text: r.content[0]!.text, error: r.isError === true }
  }
  return { client, call }
}

test('the list shows how each skill a workflow names stands, warns about one that is gone, and says nothing for a workflow whose skills are all fine', async () => {
  const s = await start()
  try {
    await s.page.locator('header').getByRole('button', { name: /Workflows/ }).click()
    const win = s.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()
    await win.getByRole('option', { name: /Skilled/ }).click()
    await expect(win.getByRole('option', { name: /Skilled/ })).toContainText('1 warning')
    await expect(win.getByRole('option', { name: /Plain/ })).not.toContainText('warning')
    await expect(win.getByRole('alert').filter({ hasText: 'not in the library' })).toContainText('1 skill this workflow names is not in the library: deploy-notes')
    // On the cards of the flow, each skill is a chip: ready ones plain, one the step grants flagged, one that is gone struck through, with what it means on hover.
    const chips = win.locator('.react-flow__node .fl-chip', { hasText: 'skill:' })
    await expect(chips.filter({ hasText: 'tdd' })).not.toHaveClass(/granted|gone/)
    await expect(chips.filter({ hasText: 'code-review' })).toHaveClass(/granted/)
    await expect(chips.filter({ hasText: 'code-review' })).toHaveAttribute('title', "this step grants it: not in the project's playbook")
    await expect(chips.filter({ hasText: 'deploy-notes' })).toHaveClass(/gone/)
    await expect(chips.filter({ hasText: 'deploy-notes' })).toHaveAttribute('title', 'not in the library')
    await win.getByRole('option', { name: /Plain/ }).click()
    await expect(win.getByRole('alert').filter({ hasText: 'not in the library' })).toHaveCount(0)
  } finally {
    await s.shutdown()
  }
})

test('the builder sees the skills there are, is refused a skill that does not exist with the real ids, and a skill outside the playbook is accepted and flagged on the draft', async () => {
  const s = await start()
  try {
    const win = await (async () => {
      await s.page.locator('header').getByRole('button', { name: /Workflows/ }).click()
      const w = s.page.getByRole('dialog', { name: 'Workflows' })
      await w.getByRole('tab', { name: 'Workflows' }).click()
      return w
    })()
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => launches(s.argsLog).length, { timeout: 20_000 }).toBe(1)
    const { client, call } = await asAgent(launches(s.argsLog)[0]!)
    const listed = (await call('workflow_list', {})).text
    expect(listed).toContain('Skills you can name on a work step:')
    expect(listed).toContain('- tdd: Write the failing test first.')
    expect(listed).toContain("- code-review: Review a diff against our standards. (not in this project's playbook; a step that names it lets agents read it)")

    const bad = await call('workflow_propose', { file: JSON.stringify({ ...SKILLED, id: 'new-one', steps: [{ id: 'fix', kind: 'work', skills: ['tdd', 'deploy-notes'] }, { id: 'land', kind: 'merge' }] }) })
    expect(bad.error).toBe(true)
    expect(bad.text).toContain('Step 1 ("fix"): there is no skill "deploy-notes" in the library. Skills you can name: agent-world-guide, tdd, code-review.')
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })

    await call('workflow_propose', { file: JSON.stringify({ version: 1, id: 'reviewed', name: 'Reviewed', steps: [{ id: 'fix', kind: 'work', name: 'Fix', skills: ['tdd'] }, { id: 'review', kind: 'work', name: 'Review', skills: ['code-review'] }, { id: 'land', kind: 'merge' }] }) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft.getByLabel('Skills not in the playbook')).toContainText('1 skill is not enabled for this project.')
    await expect(draft.getByLabel('Skills not in the playbook')).toContainText('The Review step lets agents read it while the task runs.')
    // On the card the skill is flagged, and in the fields of its step too.
    await expect(draft.getByLabel('Step 2: Review').locator('.fl-chip', { hasText: 'code-review' })).toHaveClass(/granted/)
    await draft.getByLabel('Step 2: Review').click()
    await expect(draft.getByLabel('Skills of step 2').locator('.sk', { hasText: 'code-review' })).toHaveClass(/granted/)
    // A skill is added to the step with the library's picker: searchable, grouped by where the skill came from, with its description.
    await draft.getByRole('button', { name: 'Add skill…' }).click()
    const picker = draft.getByRole('dialog', { name: 'Add a skill' })
    await expect(picker.getByRole('button', { name: 'code-review, already on this step' })).toBeVisible()
    await picker.getByLabel('Search skills').fill('failing test')
    await expect(picker).toContainText('Write the failing test first.')
    await picker.getByRole('button', { name: 'tdd' }).click()
    await expect(picker).toHaveCount(0)
    await expect(draft.getByLabel('Skills of step 2').locator('.sk', { hasText: 'tdd' })).toBeVisible()
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    await expect(win.getByRole('option', { name: /Reviewed/ })).toHaveAttribute('aria-selected', 'true')
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('an agent whose task names a skill is told to read it with library_get, can, and loses the grant when the task ends; a skill that is gone is to be skipped', async () => {
  const s = await start()
  try {
    await hire(s.page, { name: 'ada' })
    await expect.poll(() => launches(s.argsLog).length, { timeout: 20_000 }).toBe(1)
    const { client, call } = await asAgent(launches(s.argsLog)[0]!)
    // Before the task, the playbook is all there is: code-review is not in it.
    expect((await call('library_get', { id: 'code-review' })).error).toBe(true)
    expect((await call('library_get', { id: 'tdd' })).text).toContain('Body of tdd.')

    const begun = await call('task_begin', { title: 'Fix the toggle' })
    expect(begun.text).toContain('- fix "Fix" (read with library_get: tdd; there is no skill deploy-notes in the library, so skip it): Make the change.')
    expect(begun.text).toContain('- review "Review" (read with library_get: code-review):')
    expect((await call('library_get', { id: 'code-review' })).text).toContain('Body of code-review.')
    expect((await call('library_index', {})).text).toContain('- code-review (skill')
    expect((await call('library_index', {})).text).toContain('use for the step of your workflow that names it')
    expect((await call('library_get', { id: 'deploy-notes' })).error).toBe(true)

    for (let i = 0; i < 3; i++) await call('step_done', {})
    await call('task_done', { summary: 'done' })
    expect((await call('library_get', { id: 'code-review' })).error).toBe(true)
    await client.close()
  } finally {
    await s.shutdown()
  }
})
