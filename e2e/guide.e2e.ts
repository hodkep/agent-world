import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test("the app's own guide is in the library for agents to read, with one rule saying when", async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-guide-'))
  const { shutdown } = await launchApp({ AW_HOME: join(home, 'aw') }, home)
  try {
    const dir = join(home, 'aw', 'library', 'skills', 'agent-world-guide')
    await expect.poll(() => existsSync(join(dir, 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toContain('do not answer from memory')
    expect(existsSync(join(dir, 'library-and-playbook.md'))).toBe(true)
    const rules = (JSON.parse(readFileSync(join(home, 'aw', 'library', 'playbooks', 'global.json'), 'utf8')) as { rules: { id: string; when: string }[] }).rules
    expect(rules.filter((r) => r.id === 'agent-world-guide')).toHaveLength(1)
  } finally {
    await shutdown()
  }
})
