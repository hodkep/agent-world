import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { launchApp } from '../e2e/launch'

/** A project and an app home for a run with the real programs. The home is named like a second build's (`.agent-world-<name>`), so agy's own list gets an entry of its own and never touches another build's. */
export function realWorld(name: string, o: { defaultProvider?: 'claude' | 'agy'; dial?: string; files?: Record<string, string> } = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-real-${name}-`)))
  const home = join(tmp, `.agent-world-real${name}`)
  mkdirSync(home, { recursive: true })
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'node --test', lint: 'echo lint ok' } }, null, 2))
  for (const [f, text] of Object.entries(o.files ?? { 'slug.js': '// Turn a title into a url part.\nexports.slugify = (t) => t.toLowerCase()\n' })) {
    mkdirSync(join(repo, f, '..'), { recursive: true })
    writeFileSync(join(repo, f), text)
  }
  // excalidraw.log is written into the working folder by an MCP plugin on this machine; it is not part of what is tested.
  writeFileSync(join(repo, '.gitignore'), '.agent-world/plan.md\nexcalidraw.log\n')
  git('add', '-A')
  git('commit', '-qm', 'start')
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: o.defaultProvider ?? 'claude' }, workflows: { enabled: true, dial: o.dial ?? 'balanced', since: 1, planGate: true, mergeGate: true } }))
  const env: Record<string, string> = {
    AW_HOME: home,
    // The real programs and their real places: agy's plugin folder is global, which is why the person agreed to its update.
    AW_AGY_BIN: process.env.AW_AGY_BIN ?? join(homedir(), '.local', 'bin', 'agy'),
    AW_AGY_PLUGINS: join(homedir(), '.gemini', 'config', 'plugins'),
    ANTHROPIC_MODEL: process.env.REAL_MODEL ?? 'sonnet'
  }
  return { tmp, home, repo, git, env }
}

export async function startReal(w: ReturnType<typeof realWorld>, o: { width?: number; height?: number } = {}) {
  const { app, shutdown } = await launchApp(w.env, join(w.tmp, 'unused'))
  const page = await app.firstWindow()
  await page.setViewportSize({ width: o.width ?? 1400, height: o.height ?? 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), w.repo)
  await page.reload()
  return { app, page, shutdown }
}

/** Answers what a program asks for, for as long as the page is open (these runs are in a throwaway project): trusting the folder, and allowing a permission. */
export function allowAll(page: Page) {
  let on = true
  void (async () => {
    while (on) {
      try {
        // A program asks once whether it may work in a folder it has not seen: the person says yes.
        const trust = page.getByRole('button', { name: 'Trust folder' })
        if (await trust.first().isVisible()) await trust.first().click()
        // A permission asked inside a conversation (the builder's, in its window) has its Allow right there.
        const inline = page.getByRole('button', { name: 'Allow', exact: true })
        if (await inline.first().isVisible()) await inline.first().click()
        const pill = page.locator('.ask-pill').first()
        if (await pill.isVisible()) {
          await pill.click()
          const dialog = page.getByRole('dialog')
          if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Allow' }).first().click()
        }
      } catch {
        /* the page moved on; look again */
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  })()
  return () => void (on = false)
}
