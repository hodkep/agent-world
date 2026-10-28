// The pictures of the README and the user guide, taken from the real app driven by fake agents (no tokens, no sign-in).
// Not part of the normal run: `pnpm shots` runs it and saves under docs/images. Each test is one picture.
import { copyFileSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { SHOTS_DIR, SHOTS_ON, makeProject, seedTokens, type Scene, agentGit, cleanEnv, exists, hireNamed, officeTools, seedRun, shoot, setWindow, shootElement, shotApp, writeSkill } from './shotsKit'
import { seedWeek } from './workflowsWeek'

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1 pnpm shots')
test.describe.configure({ mode: 'serial' })

test('office: agents in every activity', async () => {
  const scenes: Record<string, Scene> = { ada: 'idle', bo: 'thinking', cy: 'running', di: 'researching', ed: 'implementing', fay: 'delegating', gus: 'permission', hal: 'asleep' }
  const o = await shotApp({ scenes })
  try {
    for (const name of Object.keys(scenes)) await hireNamed(o.page, name)
    await expect(o.page.getByTestId('agents-dot')).toBeVisible({ timeout: 20_000 })
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    // The agents are picked from the panel under the number, as they are once one is selected.
    await o.page.locator('.hc-switch').hover()
    await o.page.getByRole('menu', { name: 'Agents' }).getByRole('menuitem', { name: /cy/ }).click()
    await expect(o.page.locator('.hc-name')).toHaveText('cy')
    await o.page.mouse.move(300, 700)
    await o.page.waitForTimeout(2500)
    await shoot(o.page, 'office-activities')
  } finally {
    await o.shutdown()
  }
})

test('office: the agents panel under the number, and the projects panel under the project button', async () => {
  const scenes: Record<string, Scene> = { ada: 'idle', bo: 'thinking', cy: 'running', di: 'researching', ed: 'implementing', gus: 'permission' }
  const o = await shotApp({ scenes })
  try {
    // Three projects: the first has the agents, the others have some at work and one that waits for a permission, so each tile of the projects panel says something.
    const projects = [o.repo, makeProject(o.tmp, 'warehouse').repo, makeProject(o.tmp, 'checkout').repo]
    const hire = async (folder: string, names: string[]) => {
      await o.page.evaluate((f) => window.aw.activateWorkspace(f), folder)
      await o.page.reload()
      for (const name of names) await hireNamed(o.page, name)
    }
    await hire(projects[1]!, ['gus', 'di'])
    await hire(projects[2]!, ['cy'])
    await hire(projects[0]!, ['ada', 'bo', 'ed'])
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.page.locator('.hc-switch').hover()
    const agents = o.page.getByRole('menu', { name: 'Agents' })
    await expect(agents.getByRole('menuitem').first()).toBeVisible()
    await o.page.waitForTimeout(900)
    await shoot(o.page, 'office-agents-panel')
    await o.page.mouse.move(300, 700)
    await expect(agents).toBeHidden()
    await o.page.locator('.ws-button').hover()
    const panel = o.page.getByRole('menu', { name: 'Projects' })
    await expect(panel.getByRole('menuitem').first()).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /warehouse/ }).locator('.wt-need')).toHaveText('1', { timeout: 30_000 })
    await o.page.waitForTimeout(900)
    await shoot(o.page, 'office-projects-panel')
  } finally {
    await o.shutdown()
  }
})

test('permission: a request answered in the world', async () => {
  const o = await shotApp({ scenes: { ada: 'running', bo: 'thinking', gus: 'permission' } })
  try {
    for (const name of ['ada', 'bo', 'gus']) await hireNamed(o.page, name)
    await expect(o.page.getByText('Wants to use Bash')).toBeVisible({ timeout: 20_000 })
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    await o.page.waitForTimeout(1500)
    await shoot(o.page, 'permission')
  } finally {
    await o.shutdown()
  }
})

test('chat: tool cards, what the office did, and a reply', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_LIBRARY: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const box = o.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add a health check to the shop')
    await box.press('Enter')
    const log = o.page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Done. I changed', { timeout: 30_000 })
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'chat')
  } finally {
    await o.shutdown()
  }
})

test('chat: a question from the agent as a dialog', async () => {
  const o = await shotApp({ env: { FAKE_ASKQ: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await expect(o.page.getByText('Favourite colour?')).toBeVisible({ timeout: 20_000 })
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'chat-dialog')
  } finally {
    await o.shutdown()
  }
})

// ---- Chat: what an agent can draw and ask, the message box, a side question and the restart.
const REPLY = resolve(__dirname, 'fixtures', 'a2ui-reply.md')

test('chat: a diagram the agent drew, and a form it asks with', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_SAY_FILE: REPLY } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const log = o.page.getByRole('log', { name: 'Conversation with ada' })
    const diagram = log.locator('.dia').first()
    await expect(diagram.locator('svg')).toBeVisible({ timeout: 20_000 })
    await expect(log.locator('.a2ui')).toHaveCount(1)
    // One box picked, so the picture shows how a diagram is asked about.
    await diagram.locator('.rough-node', { hasText: 'android-api' }).click()
    await expect(diagram.getByRole('toolbar', { name: 'Diagram' })).toContainText('1 picked')
    await diagram.scrollIntoViewIfNeeded()
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'chat-diagram')
    await log.locator('.a2ui').scrollIntoViewIfNeeded()
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'chat-form')
    await diagram.getByRole('toolbar', { name: 'Diagram' }).getByRole('button', { name: 'Expand' }).click()
    const viewer = o.page.getByRole('dialog', { name: 'Diagram' })
    await expect(viewer.getByText('100%')).toBeVisible()
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'chat-diagram-large')
  } finally {
    await o.shutdown()
  }
})

test('chat: the message box draws markdown as it is typed', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const box = o.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('# Plan\n- keep it small\n- run /compact, then look at @src/cart.ts\n> no new dependency\nmake it **fast** and `cartTotal` first')
    await expect(box.locator('.lm-h1')).toHaveText('Plan')
    await o.page.waitForTimeout(700)
    const at = (await box.boundingBox())!
    await shoot(o.page, 'chat-markdown-box', { x: at.x - 16, y: at.y - 48, width: at.width + 32, height: Math.min(900 - at.y + 48, at.height + 80) })
  } finally {
    await o.shutdown()
  }
})

test('chat: a /btw side question answered in its own card', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const box = o.page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add a health check to the shop')
    await box.press('Enter')
    await expect(o.page.getByRole('log', { name: 'Conversation with ada' })).toContainText('Done. I changed', { timeout: 30_000 })
    await box.fill('/bt')
    await expect(o.page.getByRole('option', { name: /btw/ })).toContainText('side question')
    await o.page.waitForTimeout(500)
    await shoot(o.page, 'chat-btw-command')
    await box.press('Tab')
    await box.pressSequentially('what is 2+2?')
    await box.press('Enter')
    const card = o.page.getByRole('region', { name: 'Side question' })
    await expect(card).toContainText('It is 4.', { timeout: 25_000 })
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'chat-btw')
  } finally {
    await o.shutdown()
  }
})

test('chat: Restart agent asks first and keeps the conversation', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'nova')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.page.getByRole('button', { name: 'More actions' }).click()
    await o.page.getByRole('menuitem', { name: /Restart agent/ }).hover()
    await o.page.waitForTimeout(500)
    await shoot(o.page, 'chat-restart-menu')
    await o.page.getByRole('menuitem', { name: /Restart agent/ }).click()
    await expect(o.page.getByRole('dialog', { name: 'Restart nova?' })).toBeVisible()
    await o.page.waitForTimeout(600)
    await shoot(o.page, 'chat-restart')
  } finally {
    await o.shutdown()
  }
})

test('code: the files an agent changed and their diff', async () => {
  const o = await shotApp({ scenes: { ada: 'idle' } })
  try {
    await hireNamed(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'src', 'health.ts'), "export const ok = true\nexport const checkedAt = () => new Date().toISOString()\n")
    writeFileSync(join(ada!.cwd, 'src', 'cart.ts'), 'export const cartTotal = (items: number[]) => items.reduce((a, b) => a + b, 0)\nexport const withTax = (total: number) => Math.round(total * 1.2)\n')
    await o.page.getByRole('tab', { name: 'Code' }).click()
    await o.page.getByRole('button', { name: 'Expand' }).click()
    await o.page.getByText('health.ts').first().click()
    await expect(o.page.getByText('checkedAt').first()).toBeVisible({ timeout: 15_000 })
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'code')
  } finally {
    await o.shutdown()
  }
})

test('todos: the board an agent and the person both fill', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 1400, height: 640 } })
  try {
    await hireNamed(o.page, 'ada')
    await expect.poll(() => exists(o.argsLog)).toBe(true)
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.listAgents())).length).toBe(1)
    const tools = await officeTools(o.argsLog)
    const add = (title: string, list: string, needsYou = false) => tools.call('todo_add', { title, list, ...(needsYou && { needs_you: true }) })
    await add('Chat items for loaded skills show what they did', 'Library')
    await add('Rows for the office calls, one for each area', 'Chat')
    await add('Land from the chat, held by git', 'Workflows')
    await add('Paste the Anthropic key in Settings', 'Setup', true)
    await add('Charts: how often each stage was followed', 'Workflows')
    await add('A held merge shows as a band under the run track', 'Workflows')
    await tools.call('todo_claim', { id: '3' })
    await tools.call('todo_claim', { id: '6' })
    await tools.call('todo_done', { id: '2', note: 'Done.' })
    await tools.call('todo_done', { id: '1', note: 'Done.' })
    await o.page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    await expect(o.page.getByRole('dialog', { name: 'Todos' })).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(o.page.getByRole('dialog', { name: 'Todos' }), 'todos')
    await tools.close()
  } finally {
    await o.shutdown()
  }
})

test('library: the shelf of skills and the playbook that says when to reach for them', async () => {
  const o = await shotApp({ size: { width: 1400, height: 640 } })
  try {
    const user = join(o.tmp, 'user')
    writeSkill(user, 'tdd', 'Test-driven development: red, green, refactor.', 'Write the failing test first. Watch it fail for the right reason. Then write the least code that passes.')
    writeSkill(user, 'code-review', 'Review a change against the repository standards.', 'Read the diff. Check it against CONTRIBUTING.md. Report findings, most serious first.')
    writeSkill(user, 'commit-style', 'Conventional Commits for this repository.', 'type(scope): subject. One line unless the subject cannot say why.')
    writeSkill(user, 'pdf', 'Work with PDF files.', 'Use the helper script when asked to split a PDF.')
    await o.page.reload()
    await o.page.locator('header').getByRole('button', { name: 'Library', exact: true }).click()
    const lib = o.page.getByRole('dialog', { name: 'Library' })
    await lib.getByRole('button', { name: 'Import from this computer…' }).click()
    await lib.getByRole('button', { name: /Import \d+ selected/ }).click()
    await expect(lib.getByRole('status')).toContainText('Imported')
    await lib.getByRole('tab', { name: 'Playbook' }).click()
    await lib.getByRole('group', { name: 'Playbook scope' }).getByRole('button').nth(1).click()
    for (const [name, when] of [['tdd', 'before writing any code for a feature or a fix'], ['code-review', 'when asked to review a branch or a diff']] as const) {
      await lib.getByRole('button', { name: 'Add an item…' }).click()
      await lib.getByLabel('Search items').fill(name)
      await lib.getByLabel('Search items').press('Enter')
      await lib.getByLabel(`When to use ${name}`).fill(when)
    }
    await lib.getByRole('button', { name: 'More for tdd' }).click()
    await lib.getByRole('menuitem', { name: 'Told every time' }).click()
    await o.page.waitForTimeout(800)
    await shootElement(lib, 'playbook')
    await lib.getByRole('tab', { name: 'Shelf' }).click()
    await lib.getByRole('button', { name: 'Open commit-style' }).click()
    await o.page.waitForTimeout(800)
    await shootElement(lib, 'library')
  } finally {
    await o.shutdown()
  }
})

test('workflows: the Runs charts and the Insights tiles of a week', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    seedWeek(o.home, { ada: ada!.id, project: o.repo })
    await o.page.reload()
    await o.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = o.page.getByRole('dialog', { name: 'Workflows' })
    await expect(win.getByRole('table', { name: 'Runs' })).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(win, 'runs')
    await win.getByRole('tab', { name: 'Insights' }).click()
    // Insights is short: a smaller window, so the picture has no empty half.
    await setWindow(o.page, { width: 1400, height: 640 })
    await o.page.waitForTimeout(800)
    await shootElement(win, 'insights')
  } finally {
    await o.shutdown()
  }
})

test('workflows: a push held by git, as a card at the end of the conversation, and the agent\'s Workflow tab', async () => {
  const findings = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key; the plan puts a theme per project out of scope.' }, { kind: 'guess-wrong', text: 'The choice is saved in localStorage; the plan did not say where.' }] })
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_AUDIT: findings } })
  try {
    await hireNamed(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    await expect.poll(() => (exists(o.envLog) ? 'ok' : '')).toBe('ok')
    seedRun(o.home, { agentId: ada!.id, repo: o.repo })
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...a], { cwd: ada!.cwd, encoding: 'utf8', env: cleanEnv() })
    git('add', '-A')
    git('commit', '-qm', 'feat(settings): a dark-mode toggle')
    const asAgent = agentGit(o.envLog)
    // A remote to push to, as the agent's project has on GitHub.
    const remote = mkdtempSync(join(tmpdir(), 'aw-shots-remote-'))
    execFileSync('git', ['init', '-q', '--bare', remote], { env: cleanEnv() })
    git('remote', 'add', 'origin', remote)
    // The agent, asked in the chat to open the pull request, pushes; git asks the office, which holds it until the review's findings are seen.
    await expect.poll(async () => (await asAgent(ada!.cwd, 'push', 'origin', ada!.branch!)).out, { timeout: 30_000 }).toContain('audit findings have not been seen')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await expect(o.page.getByRole('region', { name: "ada's push is held" })).toBeVisible()
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'merge-held')
    await o.page.getByRole('tab', { name: /^Workflow/ }).click()
    await o.page.waitForTimeout(600)
    await shoot(o.page, 'workflow-tab')
  } finally {
    await o.shutdown()
  }
})

test('workflows: the audit card at the end of the conversation, where the findings are answered', async () => {
  const findings = JSON.stringify({ findings: [{ kind: 'out-of-scope', files: ['src/code/CodePanel.tsx', 'src/code/foldRule.ts', 'src/code/foldRule.test.ts', 'src/code/shortcuts.ts', 'src/code/monaco.ts'], text: 'Adds a way to fold unchanged code; the plan only fixes the line numbers.' }, { kind: 'goal-unmet', text: 'No test for a line count of five digits.' }, { kind: 'guess-wrong', text: 'Seven characters for the number column may not fit every font.' }] })
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_AUDIT: findings } })
  try {
    await hireNamed(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    seedRun(o.home, { agentId: ada!.id, repo: o.repo })
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...a], { cwd: ada!.cwd, encoding: 'utf8', env: cleanEnv() })
    git('add', '-A')
    git('commit', '-qm', 'feat(settings): a dark-mode toggle')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.page.evaluate((id) => window.aw.finishAudit(id), ada!.id)
    await expect(o.page.getByRole('region', { name: "ada's audit" })).toBeVisible({ timeout: 20_000 })
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'workflow-audit-card')
  } finally {
    await o.shutdown()
  }
})

test('workflows: the builder\'s draft, edited in place before it is saved', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 1400, height: 900 } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = o.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => exists(o.argsLog) && readFileSync(o.argsLog, 'utf8').includes('--mcp-config')).toBe(true)
    const tools = await officeTools(o.argsLog)
    const draft = {
      version: 1, id: 'billing-change', name: 'Billing change', when: 'A change touching src/billing/, including its tests.',
      steps: [
        { id: 'plan', kind: 'plan', gate: 'approve', brief: 'Say which billing code changes.' },
        { id: 'build', kind: 'work', name: 'Build' },
        { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass' },
        { id: 'review', kind: 'audit', name: 'Security audit' },
        { id: 'pr', kind: 'pr' }
      ]
    }
    await tools.call('workflow_propose', { file: JSON.stringify(draft) })
    const proposal = win.getByRole('region', { name: 'Workflow proposal' })
    await proposal.getByLabel('Step 4: Security audit').click()
    await expect(proposal.getByLabel('Name of step 4')).toHaveValue('Security audit')
    // One edit made by hand, so the picture shows the count and Undo edits.
    await proposal.getByLabel('Name of step 4').fill('Security review')
    await expect(proposal).toContainText('You edited 1 thing.')
    await o.page.waitForTimeout(800)
    await shootElement(win, 'workflow-builder')
    await tools.close()
  } finally {
    await o.shutdown()
  }
})

test('todos: a task shows how its workflow run stands and opens it', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 1400, height: 720 } })
  try {
    await hireNamed(o.page, 'ada')
    await expect.poll(() => exists(o.argsLog)).toBe(true)
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.listAgents())).length).toBe(1)
    const tools = await officeTools(o.argsLog)
    await tools.call('todo_add', { title: 'Charts: how often each stage was followed', list: 'Workflows' })
    await tools.call('todo_add', { title: 'Add a dark-mode toggle', list: 'Workflows' })
    await tools.call('todo_add', { title: 'Paste the Anthropic key in Settings', list: 'Setup', needs_you: true })
    await tools.call('todo_claim', { id: '2' })
    await tools.call('task_begin', { title: 'Add a dark-mode toggle' })
    await o.page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = o.page.getByRole('dialog', { name: 'Todos' })
    await board.getByText('Add a dark-mode toggle').first().click()
    await expect(board.locator('.td-meta')).toContainText('Workflow run')
    await o.page.waitForTimeout(800)
    await shootElement(board, 'todo-run')
    await tools.close()
  } finally {
    await o.shutdown()
  }
})

test('usage: the tanks on the lawn say what is left of the subscription limits', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_COST: '0.3' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    const stage = o.page.locator('.stage')
    const box = (await stage.boundingBox())!
    const at = JSON.parse((await stage.getAttribute('data-power'))!) as { x: number; y: number }
    // The tip shows once the pointer has come to rest on the tanks and the limits have been read: moved again until it does.
    await expect(async () => {
      await o.page.mouse.move(box.x + at.x + 6, box.y + at.y + 6)
      await o.page.mouse.move(box.x + at.x, box.y + at.y)
      await expect(o.page.getByRole('tooltip').getByRole('img', { name: /left, resets in/ }).first()).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 30_000 })
    await o.page.waitForTimeout(600)
    await shoot(o.page, 'usage')
  } finally {
    await o.shutdown()
  }
})

test('setup: Antigravity beside Claude Code', async () => {
  const o = await shotApp({ fresh: true, agy: true })
  try {
    const setup = o.page.getByRole('dialog', { name: 'First-run setup' })
    await expect(setup).toBeVisible()
    await o.page.waitForTimeout(600)
    await shoot(o.page, 'setup-welcome')
    await setup.getByRole('button', { name: 'Continue' }).click()
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'setup')
  } finally {
    await o.shutdown()
  }
})

test('hire: the form that makes an agent', async () => {
  const o = await shotApp({ scenes: { ada: 'idle' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = o.page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('bo')
    await o.page.waitForTimeout(500)
    await shoot(o.page, 'hire')
  } finally {
    await o.shutdown()
  }
})

// ---- Todos with subtasks and labels, the Notes window, the Tokens tab and the Weekly Rewind, the agents' marks, shortcuts, accounts and terminals.
test('todos: subtasks in a checklist on the card, labels, and the task in tabs', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 1400, height: 640 } })
  try {
    await hireNamed(o.page, 'ada')
    await expect.poll(() => exists(o.argsLog)).toBe(true)
    await expect.poll(async () => (await o.page.evaluate(() => window.aw.listAgents())).length).toBe(1)
    const tools = await officeTools(o.argsLog)
    await tools.call('todo_add', { title: 'Diagrams in chat', list: 'Chat', labels: ['feature'] })
    await tools.call('todo_add', { title: 'Pick boxes to ask about', parent: '1', labels: ['chat'] })
    await tools.call('todo_add', { title: 'Zoom and draw on the large view', parent: '1', labels: ['chat', 'design'] })
    await tools.call('todo_add', { title: 'Sequence diagrams', parent: '1' })
    await tools.call('todo_add', { title: 'Write the guide page', list: 'Chat', labels: ['docs'] })
    await tools.call('todo_add', { title: 'Retake the screenshots', list: 'Release', labels: ['docs', 'release'] })
    await tools.call('todo_done', { id: '2', note: 'Done.' })
    await o.page.locator('header').getByRole('button', { name: /^Todos/ }).click()
    const board = o.page.getByRole('dialog', { name: 'Todos' })
    await expect(board.getByLabel('Subtasks of Diagrams in chat')).toContainText('1 of 3 done')
    await o.page.waitForTimeout(800)
    await shootElement(board, 'todos-subtasks')
    await board.getByRole('button', { name: 'Open Diagrams in chat' }).click()
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await detail.getByRole('tab', { name: /^Subtasks/ }).click()
    await o.page.waitForTimeout(800)
    await shootElement(board, 'todos-detail')
    await tools.close()
  } finally {
    await o.shutdown()
  }
})

test('notes: the window that stays on top, with a checklist whose lines become tasks', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1' }, size: { width: 1400, height: 900 } })
  try {
    await hireNamed(o.page, 'ada')
    const opened = o.app.waitForEvent('window')
    await o.page.locator('header').getByRole('button', { name: 'Notes', exact: true }).click()
    const pad = await opened
    await setWindow(pad, { width: 760, height: 580 })
    await expect(pad.getByRole('application', { name: 'Notes' })).toBeVisible()
    await pad.getByRole('textbox', { name: 'Note' }).click()
    await pad.keyboard.insertText('# Release 0.6.0\n\nThings to settle before the tag goes out.\n\n- [ ] Retake the screenshots\n  - [x] The office and the chat\n  - [ ] The Tokens tab\n- [ ] Ask ada about the release notes\n\n> The notes carry a picture for each new feature.\n\nmake it **short**, and link `docs/images/releases`')
    await expect(pad.locator('.nt-box')).toHaveCount(4)
    await pad.locator('.nt-item', { hasText: 'Retake the screenshots' }).hover()
    await pad.locator('.nt-item', { hasText: 'Retake the screenshots' }).getByRole('button', { name: 'Make a task' }).click()
    await expect(pad.locator('.nt-linked')).toHaveCount(3)
    await o.page.waitForTimeout(900)
    await pad.getByRole('textbox', { name: 'Note' }).click()
    await pad.keyboard.press('ControlOrMeta+End')
    await pad.waitForTimeout(500)
    await shoot(pad, 'notes')
  } finally {
    await o.shutdown()
  }
})

test('usage: the Tokens tab, and the Weekly Rewind with the week\'s rise or fall in tokens', async () => {
  const o = await shotApp({ prefs: { accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }, size: { width: 1400, height: 1000 }, seed: seedTokens })
  try {
    await setWindow(o.page, { width: 1400, height: 800 })
    await o.page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const usage = o.page.getByRole('dialog', { name: 'Usage and estimated costs' })
    await expect(usage).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(usage, 'usage-overview')
    await usage.getByRole('tab', { name: 'Tokens' }).click()
    await expect(usage.locator('.st-tokens tbody tr').first()).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(usage, 'usage-tokens')
    await usage.getByRole('button', { name: /^Close/ }).first().click()
    await setWindow(o.page, { width: 1400, height: 1000 })
    await o.page.locator('header').getByRole('button', { name: 'Weekly Rewind', exact: true }).click()
    const week = o.page.getByRole('dialog', { name: 'Weekly Rewind' })
    await expect(week.locator('.st-card', { hasText: /^Tokens/ })).toBeVisible()
    await o.page.waitForTimeout(800)
    await shootElement(week, 'usage-rewind')
  } finally {
    await o.shutdown()
  }
})

test('office: the agent number and the list mark who needs you', async () => {
  const o = await shotApp({ scenes: { gus: 'permission', di: 'thinking', ada: 'idle', bo: 'idle' } })
  try {
    for (const name of ['ada', 'gus', 'di', 'bo']) await hireNamed(o.page, name)
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    // bo is the agent on screen: the number counts the others to look at, and gus's tile is marked.
    await o.page.locator('.hc-switch').hover()
    const panel = o.page.getByRole('menu', { name: 'Agents' })
    await expect(panel.getByRole('menuitem', { name: /gus/ }).locator('.wt-mark.need')).toBeVisible({ timeout: 30_000 })
    await expect(o.page.getByTestId('agents-dot')).toHaveText('1')
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'office-agent-marks')
  } finally {
    await o.shutdown()
  }
})

test('shortcuts: the sheet of every key', async () => {
  const o = await shotApp({ scenes: { ada: 'idle' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.locator('header').getByRole('button', { name: 'Shortcuts' }).click()
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'shortcuts')
  } finally {
    await o.shutdown()
  }
})

test('accounts: a second login signed in once, and the default for new agents', async () => {
  const o = await shotApp({ size: { width: 1400, height: 800 }, env: { FAKE_USED_5H: '20', FAKE_USED_5H_WORK: '70' } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    await settings.getByRole('button', { name: 'Add account' }).click()
    await settings.getByPlaceholder('Work, Personal, Client…').fill('Work')
    await settings.getByRole('button', { name: 'Continue to sign in' }).click()
    await expect.poll(() => exists(join(o.home, 'accounts', 'work', '.fake-login')), { timeout: 15_000 }).toBe(true)
    await settings.getByRole('button', { name: 'I have signed in: check' }).click()
    const row = settings.locator('.acct', { hasText: 'Work' })
    await expect(row).toContainText('Signed in', { timeout: 15_000 })
    await settings.getByRole('button', { name: 'Make default' }).last().click()
    await expect(row).toContainText('Default for new agents')
    await o.page.waitForTimeout(800)
    await shootElement(settings, 'accounts')
  } finally {
    await o.shutdown()
  }
})

test('terminals: each project has its own, in a drawer under the chat', async () => {
  const o = await shotApp({ scenes: { ada: 'idle', bo: 'idle' } })
  try {
    const other = makeProject(o.tmp, 'warehouse').repo
    await hireNamed(o.page, 'ada')
    await o.page.evaluate((f) => window.aw.activateWorkspace(f), other)
    await o.page.reload()
    await hireNamed(o.page, 'bo')
    await o.page.evaluate((f) => window.aw.activateWorkspace(f), o.repo)
    await o.page.reload()
    await o.page.locator('.term-btn').click()
    const drawer = o.page.getByRole('region', { name: 'Terminals' })
    await expect(drawer).toBeVisible()
    await o.page.getByRole('button', { name: 'New terminal in storefront' }).click()
    await expect(drawer.getByRole('tab')).toHaveCount(2)
    await drawer.locator('.xterm:visible').first().click()
    await o.page.keyboard.type('git log --oneline')
    await o.page.keyboard.press('Enter')
    await o.page.waitForTimeout(1200)
    await shoot(o.page, 'terminals')
  } finally {
    await o.shutdown()
  }
})

test('hero: hire, the character walks in, works, asks permission, approved from the world', async () => {
  test.setTimeout(300_000)
  const video = join(tmpdir(), `aw-hero-${Date.now()}`)
  const o = await shotApp({ scenes: { ada: 'story' }, video })
  try {
    await o.page.waitForTimeout(1000)
    const t0 = Date.now()
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    await o.page.waitForTimeout(500)
    await o.page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = o.page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('ada')
    await o.page.waitForTimeout(700)
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    await expect(o.page.getByText('Wants to use Bash')).toBeVisible({ timeout: 40_000 })
    await o.page.waitForTimeout(1500)
    await o.page.getByRole('button', { name: 'Allow', exact: true }).click()
    await o.page.waitForTimeout(2800)
    const clip = await o.page.video()!.path()
    await o.shutdown()
    if (process.env.SHOTS_HERO_CLIP) copyFileSync(clip, process.env.SHOTS_HERO_CLIP)
    // The recording starts with the window: cut what came before the first click, then make the GIF small enough for a README.
    const skip = Math.max(0, (t0 - o.launchedAt) / 1000 - 0.2)
    const gif = join(SHOTS_DIR, 'hero.gif')
    // The sharpest that fits: wide, at 10 frames a second with a palette of its own, and narrower and sparser only as far as the size needs.
    for (const [width, fps, colors] of [[1200, 10, 256], [1120, 10, 256], [1040, 10, 256], [960, 10, 192], [880, 10, 128], [800, 8, 96], [720, 8, 64], [640, 6, 64]] as const) {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(skip), '-i', clip, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`, '-loop', '0', gif])
      if (statSync(gif).size < 5.9 * 1024 * 1024) break
    }
    expect(statSync(gif).size).toBeLessThan(6 * 1024 * 1024)
  } finally {
    await o.shutdown()
  }
})

test('settings: the dialog with its tabs', async () => {
  const o = await shotApp({ size: { width: 1400, height: 760 } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = o.page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog).toBeVisible()
    await o.page.waitForTimeout(700)
    await shootElement(dialog, 'settings')
  } finally {
    await o.shutdown()
  }
})

test('first run: the first questions of a new Claude Code, answered in the chat', async () => {
  const o = await shotApp({ env: { FAKE_CHAT: '1', FAKE_ONBOARDING: '1' } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const card = o.page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(card).toContainText('Choose the text style', { timeout: 20_000 })
    await o.page.waitForTimeout(700)
    await shoot(o.page, 'first-run')
  } finally {
    await o.shutdown()
  }
})
