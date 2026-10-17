// The pictures of the README and the user guide, taken from the real app driven by fake agents (no tokens, no sign-in).
// Not part of the normal run: `pnpm shots` runs it and saves under docs/images. Each test is one picture.
import { statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { SHOTS_DIR, SHOTS_ON, type Scene, agentGit, cleanEnv, exists, hireNamed, officeTools, seedRun, shoot, shootElement, shotApp, writeSkill } from './shotsKit'
import { seedWeek } from './workflowsWeek'

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1 pnpm shots')
test.describe.configure({ mode: 'serial' })

test('office: agents in every activity', async () => {
  const scenes: Record<string, Scene> = { ada: 'idle', bo: 'thinking', cy: 'running', di: 'researching', ed: 'implementing', fay: 'delegating', gus: 'permission', hal: 'asleep' }
  const o = await shotApp({ scenes })
  try {
    for (const name of Object.keys(scenes)) await hireNamed(o.page, name)
    await expect(o.page.locator('.ask-pill').first()).toBeVisible({ timeout: 20_000 })
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    await o.page.locator('aside, main').getByText('cy', { exact: true }).first().click().catch(() => undefined)
    await o.page.waitForTimeout(2500)
    await shoot(o.page, 'office-activities')
  } finally {
    await o.shutdown()
  }
})

test('permission: a request answered in the world', async () => {
  const o = await shotApp({ scenes: { ada: 'running', bo: 'thinking', gus: 'permission' } })
  try {
    for (const name of ['ada', 'bo', 'gus']) await hireNamed(o.page, name)
    await expect(o.page.locator('.ask-pill').first()).toBeVisible({ timeout: 20_000 })
    await o.page.getByRole('button', { name: 'Fit office' }).click()
    await o.page.locator('.ask-pill').first().click()
    await expect(o.page.getByText('Wants to use Bash')).toBeVisible()
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
    await o.page.setViewportSize({ width: 1400, height: 640 })
    await o.page.waitForTimeout(800)
    await shootElement(win, 'insights')
  } finally {
    await o.shutdown()
  }
})

test('workflows: a merge held by git, as the band under the run track, and the agent\'s Workflow tab', async () => {
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
    // The agent, asked in the chat to merge, tries; git asks the office, which holds it until the review's findings are seen.
    await expect.poll(async () => (await asAgent(o.repo, 'merge', '--ff-only', ada!.branch!)).out, { timeout: 30_000 }).toContain('audit findings have not been seen')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await expect(o.page.getByRole('region', { name: "ada's merge is held" })).toBeVisible()
    await o.page.waitForTimeout(800)
    await shoot(o.page, 'merge-held')
    await o.page.getByRole('tab', { name: /^Workflow/ }).click()
    await o.page.waitForTimeout(600)
    await shoot(o.page, 'workflow-tab')
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
    await o.page.mouse.move(box.x + at.x, box.y + at.y)
    await expect(o.page.getByRole('tooltip').getByRole('img', { name: /left, resets in/ }).first()).toBeVisible({ timeout: 15_000 })
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

test('hero: hire, the character walks in, works, asks permission, approved from the world', async () => {
  test.setTimeout(120_000)
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
    await expect(o.page.locator('.ask-pill').first()).toBeVisible({ timeout: 40_000 })
    await o.page.waitForTimeout(1000)
    await o.page.locator('.ask-pill').first().click()
    await o.page.waitForTimeout(900)
    await o.page.getByRole('button', { name: 'Allow', exact: true }).click()
    await o.page.waitForTimeout(2800)
    const clip = await o.page.video()!.path()
    await o.shutdown()
    // The recording starts with the window: cut what came before the first click, then make the GIF small enough for a README.
    const skip = Math.max(0, (t0 - o.launchedAt) / 1000 - 0.2)
    const gif = join(SHOTS_DIR, 'hero.gif')
    for (const [width, fps, colors] of [[880, 10, 128], [800, 8, 96], [720, 8, 64], [640, 6, 64]] as const) {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(skip), '-i', clip, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', gif])
      if (statSync(gif).size < 4.8 * 1024 * 1024) break
    }
    expect(statSync(gif).size).toBeLessThan(5 * 1024 * 1024)
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
