import { describe, expect, it, vi } from 'vitest'
import { installSkills, listSkills, parseList, validPackage } from './installer'

const LIST = `
│
◇  Source: https://github.com/vercel-labs/skills.git
◇  Found 2 skills
│
◇  Available Skills
│
│    find-skills
│
│      Helps users discover and install agent skills.
│
│    test-driven-development
│
│      Write the test first.

│
└  Use --skill <name> to install specific skills
`

describe('the skills CLI installer', () => {
  it('reads the skills a repository holds from the CLI listing', () => {
    expect(parseList(LIST)).toEqual([
      { name: 'find-skills', description: 'Helps users discover and install agent skills.' },
      { name: 'test-driven-development', description: 'Write the test first.' }
    ])
    expect(parseList('nothing here')).toEqual([])
  })
  it('accepts only a repository or a link, so nothing can be passed to the CLI as an option', () => {
    for (const ok of ['vercel-labs/skills', 'obra/superpowers', 'https://github.com/obra/superpowers', 'https://github.com/obra/superpowers.git']) expect(validPackage(ok)).toBe(true)
    for (const bad of ['', '--all', '-g', 'a b/c', 'owner/repo;rm -rf', 'file:///etc', '../x', 'http://evil.test/x', 'notion']) expect(validPackage(bad)).toBe(false)
  })
  it('lists with -l and installs globally with no agent chosen, then names where each skill landed', async () => {
    const run = vi.fn(async (args: string[]) =>
      args.includes('-l') ? { code: 0, out: LIST } : { code: 0, out: 'noise\n[\n  {"name":"find-skills","status":"installed","path":"/h/.agents/skills/find-skills"}\n]\n' }
    )
    expect((await listSkills('vercel-labs/skills', run)).map((s) => s.name)).toEqual(['find-skills', 'test-driven-development'])
    expect(run.mock.calls[0]![0]).toEqual(['skills', 'add', 'vercel-labs/skills', '-l'])
    const lines: string[] = []
    const done = await installSkills('vercel-labs/skills', ['find-skills'], run, (l) => lines.push(l))
    expect(run.mock.calls[1]![0]).toEqual(['skills', 'add', 'vercel-labs/skills', '-g', '-y', '--json', '-s', 'find-skills'])
    expect(done).toEqual([{ name: 'find-skills', path: '/h/.agents/skills/find-skills' }])
  })
  it('says the CLI\'s own error line, without its spinner or npm\'s notices', async () => {
    const run = vi.fn(async () => ({ code: 1, out: '◒  Cloning repository…\r◐  Cloning repository…\n■  Failed to clone repository\n│\n│  Authentication failed for https://github.com/a/b.git.\n│\n│  Tip: use the --yes flag\n└  Installation failed\nnpm notice New major version\n' }))
    await expect(listSkills('a/b', run)).rejects.toThrow(/^Failed to clone repository: Authentication failed for https:\/\/github.com\/a\/b.git.$/)
  })
  it('refuses a skill name that is not a plain name, and reports a failed run with what the CLI said', async () => {
    const run = vi.fn(async () => ({ code: 1, out: 'boom: no such repository\nnpm notice\nnpm notice New major version of npm available!\n' }))
    await expect(installSkills('a/b', ['--all'], run, () => {})).rejects.toThrow(/skill name/)
    await expect(installSkills('a/b', ['x'], run, () => {})).rejects.toThrow(/^boom: no such repository$/)
    await expect(listSkills('a/b', run)).rejects.toThrow(/boom/)
    await expect(listSkills('--all', run)).rejects.toThrow(/repository/)
  })
})
