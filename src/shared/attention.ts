/** The dot on a switcher button: another project (or agent) needs you, or finished, or nothing. */
export type Dot = 'need' | 'done' | null

const WORKING = new Set(['thinking', 'researching', 'implementing', 'running', 'delegating'])

/**
 * Which agents finished while you were not looking at them: one that went from working to idle between two looks. It is remembered until its project is opened
 * (or the agent is selected), for this session only.
 */
export function createDoneTracker() {
  const last = new Map<string, string>()
  const done = new Map<string, string>()
  return {
    observe(agents: { id: string; repoPath: string; activity: string }[]) {
      const ids = new Set(agents.map((a) => a.id))
      for (const a of agents) {
        if (WORKING.has(last.get(a.id) ?? '') && a.activity === 'idle') done.set(a.id, a.repoPath)
        last.set(a.id, a.activity)
      }
      for (const id of [...last.keys()]) if (!ids.has(id)) (last.delete(id), done.delete(id))
    },
    /** The project was opened: what finished there has been seen. */
    opened(repoPath: string) {
      for (const [id, p] of done) if (p === repoPath) done.delete(id)
    },
    /** The agent was selected: its finish has been seen. */
    selected(id: string) {
      done.delete(id)
    },
    agents: () => new Set(done.keys()),
    projects: () => new Set(done.values())
  }
}

/** The project button: red when another project has agents waiting for you, else green when an agent in another project finished unseen. The open project is never marked. */
export function projectDot(o: { activity: Record<string, { waiting: number; working: number }>; active: string | null; done: Set<string> }): Dot {
  const others = Object.entries(o.activity).filter(([path]) => path !== o.active)
  if (others.some(([, a]) => a.waiting > 0)) return 'need'
  return [...o.done].some((p) => p !== o.active) ? 'done' : null
}

/** The agent number: red when another agent here waits for you, else green when another finished unseen. The agent you are on is never counted. */
export function agentDot(o: { selected: string | null; agents: { id: string; asks: boolean }[]; done: Set<string> }): Dot {
  const others = o.agents.filter((a) => a.id !== o.selected)
  if (others.some((a) => a.asks)) return 'need'
  return others.some((a) => o.done.has(a.id)) ? 'done' : null
}
