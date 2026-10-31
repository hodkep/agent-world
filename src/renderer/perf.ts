interface Timing {
  name: string
  startTime: number
  duration: number
  scripts?: { sourceURL?: string; sourceFunctionName?: string; duration: number }[]
}

/** What goes in perf.log for one long task or long animation frame: how long, when, what was on screen, and the scripts if the browser names them. */
export function longTaskEntry(t: Timing, context: Record<string, unknown>) {
  const scripts = t.scripts?.map((s) => ({ file: (s.sourceURL ?? '').split('/').pop() || '?', fn: s.sourceFunctionName || '(anonymous)', ms: Math.round(s.duration) }))
  return { name: t.name, ms: Math.round(t.duration), start: Math.round(t.startTime), ...context, ...(scripts?.length ? { scripts } : {}) }
}

const onScreen = () => ({
  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label') ?? '',
  rows: document.querySelectorAll('.chat-log > *').length,
  focus: document.activeElement?.tagName.toLowerCase() ?? ''
})

/** With AW_PERF=1, tells the main process about every page task that held the thread for 100 ms or more. */
export function watchLongTasks() {
  void window.aw.perfEnabled().then((on) => {
    if (!on) return
    for (const type of ['longtask', 'long-animation-frame']) {
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (e.duration >= 100) window.aw.perfLog(longTaskEntry({ name: type, startTime: e.startTime, duration: e.duration, scripts: (e as unknown as Timing).scripts }, onScreen()))
        }).observe({ type, buffered: true })
      } catch {
        /* this Chromium does not know that entry type */
      }
    }
  }, () => {})
}
