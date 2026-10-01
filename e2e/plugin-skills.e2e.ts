import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const put = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

test('skills from installed plugins, including grouped ones, are offered when typing /', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-skills-')))
  // A home of its own, with a plugin laid out the way Matt Pocock's is: its manifest lists skills inside groups.
  const home = join(tmp, 'home')
  const plugin = join(home, '.claude', 'plugins', 'cache', 'mk', 'mattpocock-skills', '1.0.0')
  put(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'mattpocock-skills', skills: ['./skills/engineering/tdd', './skills/productivity/grill-me'] }))
  put(join(plugin, 'skills', 'engineering', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: Test-driven development\n---\n')
  put(join(plugin, 'skills', 'productivity', 'grill-me', 'SKILL.md'), '---\nname: grill-me\ndescription: Get grilled on a plan\n---\n')
  put(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'mattpocock-skills@mk': [{ installPath: plugin }] } }))
  put(join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'mattpocock-skills@mk': true } }))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ HOME: home, AW_HOME: join(tmp, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.fill('/matt')
    const list = page.getByRole('listbox', { name: 'Suggestions' })
    await expect(list.getByRole('option', { name: /mattpocock-skills:tdd/ })).toContainText('Test-driven development')
    await expect(list.getByRole('option', { name: /mattpocock-skills:grill-me/ })).toBeVisible()
    await expect(list.getByRole('option', { name: /mattpocock-skills:tdd/ })).toContainText('skill')
  } finally {
    await shutdown()
  }
})
