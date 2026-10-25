import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderDoc } from './doc'
import { Playbooks } from './playbook'

export const GUIDE_ID = 'agent-world-guide'
/** When an agent should read the guide: the playbook rule's "when" line. */
export const GUIDE_WHEN = 'the user asks how to do something in Agent World (a button, menu, setting or feature)'

const SOURCE = 'built-in'

/** The first sentence of the line under a page's title, as what the page answers. */
const about = (text: string) => (text.split('\n').find((l, i) => i > 0 && l.trim() && !l.startsWith('#') && !l.startsWith('!')) ?? '').trim()
const title = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? ''

/** A page as an agent reads it: the words as on GitHub, without the pictures it cannot see. */
const forAgent = (text: string) => text.replace(/^!\[[^\n]*\]\([^)\n]*\)\n+/gm, '')

function skillText(pages: { file: string; text: string }[]) {
  const index = pages.map((p) => `- ${p.file}: ${title(p.text)}. ${about(p.text)}`).join('\n')
  return [
    'This is the guide to using Agent World, the same pages as the guide on GitHub.',
    'When the user asks how to do something in the app, read the page that covers it first with library_get and its file name, and do not answer from memory: the buttons, menus and settings change between versions, and the pages are kept to the version in use.',
    "Give the steps the way the page gives them, naming each button, tab and setting as it is written there. If no page covers it, say so; do not guess a control's name.",
    `Pages (read one with library_get('${GUIDE_ID}', file)):\n${index}`
  ].join('\n\n')
}

/**
 * Keeps the library's copy of the guide (a skill with a page per file) the same as the guide pages the app ships, so there is one place to write
 * and the pages on GitHub and the ones an agent reads cannot differ. The playbook gets one rule for it, once: a person who takes it out keeps it out.
 * The guide pages missing (an install without them) leaves the library as it was.
 */
export function syncGuide(o: { root: string; guideDir: string }) {
  let names: string[]
  try {
    names = readdirSync(o.guideDir).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return
  }
  if (!names.length) return
  const pages = names.map((file) => ({ file, text: forAgent(readFileSync(join(o.guideDir, file), 'utf8')) }))
  const skill = renderDoc({ name: 'Agent World guide', description: 'How to do things in Agent World, step by step, from the app\'s own guide. Read it when the user asks how to do something in the app.', body: skillText(pages) })
  const hash = createHash('sha256').update(skill).update(JSON.stringify(pages)).digest('hex')
  const dir = join(o.root, 'skills', GUIDE_ID)
  const stamp = join(dir, '.aw-guide-hash')
  const current = (() => {
    try {
      return readFileSync(stamp, 'utf8')
    } catch {
      return ''
    }
  })()
  if (current !== hash) {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), skill)
    for (const p of pages) writeFileSync(join(dir, p.file), p.text)
    writeFileSync(join(dir, '.aw-source'), SOURCE)
    writeFileSync(stamp, hash)
  }
  const marker = join(o.root, 'playbooks', '.guide-rule')
  if (existsSync(marker)) return
  const playbooks = new Playbooks(o.root)
  const rules = playbooks.read('global')
  if (!rules.some((r) => r.id === GUIDE_ID)) playbooks.write('global', [...rules, { id: GUIDE_ID, mode: 'on-demand', when: GUIDE_WHEN, strength: 'soft' }])
  mkdirSync(join(o.root, 'playbooks'), { recursive: true })
  writeFileSync(marker, GUIDE_ID)
}
