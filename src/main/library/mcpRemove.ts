import { needsConfirm, type McpServer, type RemovalMode, type RemovalPlan, type RemovalStep } from '../../shared/mcp'

const same = (a: McpServer, b: McpServer) => a.name === b.name && a.transport === b.transport && a.fact === b.fact && a.env.join('\n') === b.env.join('\n')
const rank = (s: McpServer) => (s.where === 'global' ? 0 : needsConfirm(s) ? 2 : 1)

/**
 * What taking a server out of some of its places would do, shown before it is done. Only the places Claude Code's files and project `.mcp.json` files give (the ones the app can
 * edit, and that the row stands for) are ever listed; agy's list, a plugin's and the office's are not. Keeping one global copies the entry into Claude's own file first when there is
 * none, and never from a repo's own `.mcp.json`: that would make a command the person has not seen into one of their own, which runs without asking.
 */
export function planRemoval(all: McpServer[], row: McpServer, mode: RemovalMode, placeId?: string, globalFile = ''): RemovalPlan {
  const places = all.filter((s) => same(s, row) && s.editable && (s.where === 'global' || s.where === 'project')).sort((a, b) => rank(a) - rank(b) || (a.project ?? '').localeCompare(b.project ?? '') || a.path.localeCompare(b.path))
  const step = (action: RemovalStep['action'], s: McpServer, path = s.path): RemovalStep => ({ action, id: s.id, path, ...(s.project && { project: s.project }), repo: needsConfirm(s) })
  if (mode === 'one') {
    const s = places.find((p) => p.id === placeId)
    if (!s) throw new Error('That is not one of its places.')
    return { steps: [step('remove', s)] }
  }
  const projects = places.filter((p) => p.where === 'project')
  if (mode === 'projects' || mode === 'keep-global') {
    if (!projects.length) throw new Error('It is not in any project.')
    const out: RemovalStep[] = []
    if (mode === 'keep-global' && !places.some((p) => p.where === 'global')) {
      const from = projects.find((p) => !needsConfirm(p))
      if (!from) throw new Error('Its only copies come with a repo: add it yourself with Add server… so you have seen it, then keep that one.')
      out.push(step('add-global', from, globalFile))
    }
    return { steps: [...out, ...projects.map((p) => step('remove', p))] }
  }
  if (!places.length) throw new Error('It is in none of the places the app can change.')
  return { steps: places.map((p) => step('remove', p)) }
}
