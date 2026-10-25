import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

/** Every bold name in the guide is a button, tab, menu or setting the person is told to find, so it must still be written in the app. */
const source = walk(join(root, 'src'))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .toLowerCase()
  .replace(/&amp;/g, '&')
  // What the app fills in (a name, a count, a program's label) is a gap in the text.
  .replace(/\$\{[^{}\n]*\}|\{[^{}:\n]*\}/g, '\u0001')

/** Bold words that are not controls of the app: other programs' menus, versions, and the like. Say why each is here. */
const NOT_THE_APP = new Set([
  'system settings > privacy & security', // macOS
  'privacy & security', // macOS System Settings
  '⇧⌘l', // the shortcut sheet writes the keys as Shift+Mod+L
  '▲ ▼', // two buttons, each drawn on its own
  'n audit findings have not been seen', // the verb and the plural follow the count
  'open anyway', // macOS System Settings
  'macos 14 and earlier',
  'macos 15 (sequoia) and later',
  'a mac build that is not signed with an apple developer id',
  'a build that can install itself',
  'any version',
  'installed somewhere the app does not look',
  '7 days', // a duration the text explains, set in a menu by its number
  '30 days'
])

/** A name with a count, an agent, a branch or a program in it is written in the app with a value in that place. */
const pattern = (s: string) =>
  new RegExp(
    s
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // A counted thing is plural or not with the count.
      .replace(/\bn\s+(\w+?)s\b/g, '.+ $1s?')
      .replace(/<name>|\bname\b|\bn\b|\bada\b|\bmain\b|\bstandard\b|claude code|agy \\\(antigravity\\\)/g, '.+')
      .replace(/\s+/g, '\\s+')
  )

const controls = (): { page: string; name: string }[] =>
  readdirSync(join(root, 'docs', 'guide'))
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) => {
      const text = readFileSync(join(root, 'docs', 'guide', f), 'utf8').replace(/```[\s\S]*?```/g, '')
      return [...text.matchAll(/\*\*([^*\n]+)\*\*/g)].map((m) => ({ page: f, name: m[1]!.trim().replace(/[:.,]$/, '').replace(/…$/, '').replace(/\.$/, '') }))
    })

describe('the guide names what is in the app', () => {
  it('finds the controls it names', () => {
    expect(controls().length).toBeGreaterThan(300)
  })
  it('every bold name is written somewhere in the app', () => {
    const gone = controls().filter(({ name }) => name && !NOT_THE_APP.has(name.toLowerCase()) && !pattern(name).test(source))
    expect(gone.map((g) => `${g.page}: ${g.name}`)).toEqual([])
  })
})
