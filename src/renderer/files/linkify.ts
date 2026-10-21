import { openFileEvent } from './context'
import { findFolderCandidates, findPathCandidates, linkName } from './links'

type Info = Awaited<ReturnType<typeof window.aw.fileInfo>>[number]
const known = new Map<string, Promise<Info>>()

/** Which of these written paths are real files for this agent, remembered so a message is not checked twice. */
async function check(agentId: string, paths: string[]): Promise<Map<string, Info>> {
  const fresh = paths.filter((p) => !known.has(`${agentId}\n${p}`))
  if (fresh.length) {
    const asked = window.aw.fileInfo(agentId, fresh)
    fresh.forEach((p, i) => known.set(`${agentId}\n${p}`, asked.then((r) => r[i] ?? null, () => null)))
  }
  const out = new Map<string, Info>()
  await Promise.all(paths.map(async (p) => out.set(p, await known.get(`${agentId}\n${p}`)!)))
  return out
}

function makeLink(path: string, agentId: string, info: Info): HTMLAnchorElement {
  const a = document.createElement('a')
  a.className = info?.kind === 'folder' ? 'file-link folder-link' : 'file-link'
  a.href = '#'
  a.dataset.path = path
  // Right-click offers Reveal in Finder; a folder has nothing to open in the Code tab, so a click on it reveals it.
  a.dataset.reveal = path
  a.dataset.revealAgent = agentId
  if (info?.kind === 'folder') a.dataset.kind = 'folder'
  a.title = path
  a.textContent = linkName(path)
  return a
}

const SKIP = 'a, pre, button, textarea, .katex, svg'

/**
 * Turns the paths of real files in a rendered message into links named after the file. Text nodes and inline code are
 * checked; a path that is not a file on this machine is left exactly as written.
 */
export async function linkifyFiles(root: HTMLElement, agentId: string) {
  if (!agentId) return
  const spots: { node: Text | HTMLElement; start: number; end: number; text: string }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text)
  for (const t of texts) {
    const parent = t.parentElement
    if (!parent || parent.closest(SKIP) || parent.closest('.file-link')) {
      // An inline code span that is just a path is also a link.
      continue
    }
    for (const c of [...findPathCandidates(t.data), ...findFolderCandidates(t.data)]) spots.push({ node: t, ...c })
  }
  const inline = [...root.querySelectorAll<HTMLElement>('code')].filter((c) => !c.closest('pre, a') && !c.querySelector('a'))
  const wholeCode = inline.flatMap((c) => {
    const text = c.textContent?.trim() ?? ''
    const found = [...findPathCandidates(text), ...findFolderCandidates(text)]
    return found.length === 1 && found[0]!.start === 0 && found[0]!.end === text.length ? [{ el: c, text }] : []
  })
  const wanted = [...new Set([...spots.map((s) => s.text), ...wholeCode.map((c) => c.text)])].slice(0, 40)
  if (!wanted.length) return
  const infos = await check(agentId, wanted)
  if (!root.isConnected) return
  for (const { el, text } of wholeCode) {
    const info = infos.get(text)
    if (info) el.replaceChildren(makeLink(text, agentId, info))
  }
  // Right to left inside each text node, so earlier offsets stay valid as the node is split.
  const byNode = new Map<Text, typeof spots>()
  for (const sp of spots) if (infos.get(sp.text) && (sp.node as Text).isConnected) byNode.set(sp.node as Text, [...(byNode.get(sp.node as Text) ?? []), sp])
  for (const [node, list] of byNode) {
    for (const sp of list.sort((a, b) => b.start - a.start)) {
      const mid = node.splitText(sp.start)
      mid.splitText(sp.end - sp.start)
      mid.replaceWith(makeLink(sp.text, agentId, infos.get(sp.text)!))
    }
  }
}

/** Clicks on a file link, wherever it sits in the page. */
export function handleFileClick(e: { target: EventTarget | null; preventDefault(): void }, agentId: string): boolean {
  const a = (e.target as HTMLElement | null)?.closest?.('a.file-link') as HTMLAnchorElement | null
  const path = a?.dataset.path
  if (!path) return false
  e.preventDefault()
  if (a?.dataset.kind === 'folder') void window.aw.revealShow(agentId, path)
  else openFileEvent(agentId, path)
  return true
}
