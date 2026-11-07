import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderDoc } from './doc'
import { Playbooks } from './playbook'

export const BROWSER_ID = 'preview-browser'
/** The version of the tool the skill tells an agent to run (with npx, so nothing has to be installed): pinned, so what an agent runs is what was tried. */
export const AGENT_BROWSER_VERSION = '0.41.2'
/** When an agent should read it: the playbook rule's "when" line. */
export const BROWSER_WHEN = 'the task needs a real browser: log into a site, click through pages, fill in a form, or read what a page draws with a script (fetching its text is not enough)'

const SOURCE = 'built-in'
/** The commands an agent may run without being asked, while the Settings switch is on: the pinned tool, by prefix. Nothing else; and the tool can only reach that agent's own Preview page. */
export const BROWSER_TOOLS = [`Bash(npx -y agent-browser@${AGENT_BROWSER_VERSION}:*)`]
const tool = `npx -y agent-browser@${AGENT_BROWSER_VERSION}`

const body = `Your Preview tab is a real browser, on the logins this person's Preview keeps (shared by every agent). Use it when a page needs a browser: logging in, clicking through, filling in forms, reading what a script draws, checking how a page looks. For a plain fetch of a page's text, curl is enough.

It is already set up for you: the address of your own page is in AW_BROWSER_CDP, and the tool reads it by itself, so the commands need no flags. Run them in your shell:

- \`${tool} open <address>\`: go to a page.
- \`${tool} snapshot -i\`: what is on the page, with a @ref for each control. Take a new one after every move: the refs change.
- \`${tool} click @e2\`, \`fill @e3 "text"\`, \`type @e3 "text"\`, \`press Enter\`, \`select @e4 "option"\`, \`scrollintoview @e5\`.
- Screen sizes: \`${tool} set viewport 390 844\` (a phone), \`set viewport 820 1180\` (a tablet), \`set viewport 1440 900\` (a desktop), or \`set device "iPhone 14"\`; then \`snapshot\` or \`screenshot\` to look. The page lays out at that size (media queries and \`innerWidth\` answer for it) and the person sees the size on the frame. The size stays until you set another or run \`${tool} close\`, so close when you are done checking.
- \`${tool} get text "<selector>"\`, \`get url\`, \`eval "<js>"\`, \`screenshot <file>\`, \`wait --text "Done"\`.
- Playwright works too: \`chromium.connectOverCDP(process.env.AW_BROWSER_CDP)\`.

What to know:

- Run one command per call, as it is shown here: no pipes (\`| head\`), no \`&&\` chains, no shell variables. A plain command is already allowed; a chain or a pipe may be blocked by Claude Code, and then none of it runs. To read less, use \`snapshot -i\` or \`get text "<selector>"\`.
- If a command is blocked or not allowed, or the browser is not available, do not switch to another browser tool (Playwright or any other): they do not use the person's Preview and its logins. Say which command was blocked and why, then try the plain form once, then tell the person what you need.
- Claude Code's own safety check may block an address with a query string (\`open "https://site/search?q=..."\`). Then open the site's plain address and use the page's own search box (\`fill\`, then \`press Enter\`).
- A CAPTCHA, a "verify you are human" page or a login the person must do is the person's to do, in this same Preview, where they can see it: ask the person to do it, and wait. Do not try to get round it.
- You have one tab: your Preview page. \`open\` moves it. There are no new windows, file uploads or downloads.
- The person sees every action in their Preview tab, inside a frame with your name, and can disconnect you from it. Work in steps they can follow.
- A site on the internet that the person has not allowed yet is not opened at once: the Preview asks them, and the command waits a little. If it answers that the site is waiting for the person, tell the person to answer the question in the Preview, then run the same command again; once they allow it, it opens at once. If the answer is "not now", do not try again; tell the person what you needed and why.
- The logins are the person's own. Do not sign in to anything unless they asked you to, and never read out or save cookie values.
- A 403 answer means the person switched browser tools off (or disconnected you): stop and say so.
- Your page lives in the Preview. If a command says there is no page, run \`open <address>\` and it is made.`

/**
 * Keeps one built-in skill in the library that tells an agent it has a browser, and how to use it, and adds one rule to the Everywhere playbook once so it is read when a task needs one.
 * A person who takes the rule out keeps it out. Like the guide, the skill is rewritten only when the app's own text changes.
 */
export function syncBrowserSkill(o: { root: string }) {
  const skill = renderDoc({ name: 'Preview browser', description: "Use this agent's Preview tab as a real browser, on the person's logins: open pages, read them, click, fill in forms, take screenshots. Read it when a task needs a real browser.", body })
  const hash = createHash('sha256').update(skill).digest('hex')
  const dir = join(o.root, 'skills', BROWSER_ID)
  const stamp = join(dir, '.aw-browser-hash')
  const current = existsSync(stamp) ? readFileSync(stamp, 'utf8') : ''
  if (current !== hash) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), skill)
    writeFileSync(join(dir, '.aw-source'), SOURCE)
    writeFileSync(stamp, hash)
  }
  const marker = join(o.root, 'playbooks', '.browser-rule')
  if (existsSync(marker)) return
  const playbooks = new Playbooks(o.root)
  const rules = playbooks.read('global')
  if (!rules.some((r) => r.id === BROWSER_ID)) playbooks.write('global', [...rules, { id: BROWSER_ID, mode: 'on-demand', when: BROWSER_WHEN, strength: 'soft' }])
  mkdirSync(join(o.root, 'playbooks'), { recursive: true })
  writeFileSync(marker, BROWSER_ID)
}
