import { useEffect, useState } from 'react'
import type { BrowserGroup } from './browserGroup'
import { browserCalls, describeCall, refNames, type BrowserLine } from './browserSteps'
import { spanLabel } from './format'
import type { PictureSet } from './gallery'
import { ToolCard } from './ToolCard'

interface Step {
  line: BrowserLine
  state: 'ok' | 'now' | 'bad'
  note?: string
  sec?: number
}

/** What Claude Code says when a command is not allowed. */
const DENIED = /permission for this action was denied|denied by the claude code|auto mode classifier|requires approval|permission to use .* has been denied/i

/** The reason a command failed, in a line: the tool says `✗ CDP error (Page.navigate): <reason>`. */
const reason = (text: string) => {
  const first = text.split('\n').find((l) => l.trim()) ?? ''
  return (/CDP error \([^)]*\):\s*(.*)$/.exec(first)?.[1] ?? first.replace(/^✗\s*/, '')).slice(0, 160)
}

/** Every step of the run as a line, the controls named from the pages the agent read on the way. */
function stepsOf(group: BrowserGroup, working: boolean): Step[] {
  const refs: Record<string, string> = { ...group.refs }
  const out: Step[] = []
  for (const c of group.calls) {
    const calls = browserCalls(String(c.run.input.command ?? ''))
    const result = c.run.result
    // A command Claude Code did not allow ran none of its parts, so none shows as done; any other failure is the last step's, the ones before it ran.
    const denied = !!result?.isError && DENIED.test(result.text)
    calls.forEach((call, i) => {
      const last = i === calls.length - 1
      const line = describeCall(call, refs, last ? result?.text : undefined)
      const state: Step['state'] = denied || (last && result?.isError) ? 'bad' : last && !result && working ? 'now' : 'ok'
      out.push({ line, state, ...(state === 'bad' && (last || denied) && i === (denied ? 0 : calls.length - 1) && { note: denied ? `Claude Code did not allow this command. ${reason(result!.text)}` : reason(result!.text) }), ...(last && c.run.sec ? { sec: c.run.sec } : {}) })
    })
    if (result?.text) Object.assign(refs, refNames(result.text))
  }
  return out
}

const hostOf = (steps: Step[]) => {
  for (let i = steps.length - 1; i >= 0; i--) {
    const link = steps[i]!.line.link
    if (link) {
      try {
        return new URL(link).host
      } catch {
        /* not an address */
      }
    }
  }
  return ''
}

/** A screenshot the agent saved in its folder, shown small; where the app cannot reach the file, its name. */
function Shot({ agentId, file, onImage }: { agentId: string; file: string; onImage: (src: string, set?: PictureSet) => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    // The picture is read by the name the command gave it, and shown only when it is in the agent's own folder: the name is the agent's to choose, the rest of the machine is not.
    void window.aw.fileImage(agentId, file).then(({ info, src }) => live && info.inside && setSrc(src), () => undefined)
    return () => {
      live = false
    }
  }, [agentId, file])
  return src ? (
    <button className="bc-shot" onClick={() => onImage(src)} aria-label={`Open the screenshot ${file.split('/').pop()}`}>
      <img src={src} alt="" />
    </button>
  ) : (
    <code className="bc-file">{file.split('/').pop()}</code>
  )
}

/**
 * A run of the agent's browser commands as one card: the site, whether it works or is done, a button to the agent's Preview, and a timeline with a plain sentence per step.
 * The commands themselves are one click away.
 */
export function BrowserCard({ group, agentId, agentName, working, onOpenPreview, onImage }: { group: BrowserGroup; agentId: string; agentName: string; working: boolean; onOpenPreview: (agentId: string) => void; onImage: (src: string, set?: PictureSet) => void }) {
  const [raw, setRaw] = useState(false)
  const steps = stepsOf(group, working)
  const host = hostOf(steps)
  const failed = steps.filter((s) => s.state === 'bad').length
  const blocked = group.calls.some((c) => c.run.result?.isError && DENIED.test(c.run.result.text))
  const sec = group.calls.reduce((n, c) => n + (c.run.sec ?? 0), 0)
  const meta = [agentName, working ? 'working' : '', `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`, failed ? `${failed} ${blocked ? 'not allowed' : 'failed'}` : '', !working && sec ? spanLabel(sec) : ''].filter(Boolean).join(' · ')
  const n = group.calls.length
  return (
    <div className={`bc${working ? ' is-working' : ''}${failed ? ' has-failed' : ''}`}>
      <div className="bc-head">
        <span className="bc-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
        </span>
        <span className="bc-title">
          <b>
            {working ? 'Browsing' : 'Browsed'}
            {host ? ` ${host}` : ''}
          </b>
          <small>{meta}</small>
        </span>
        <button className={`bc-open${working ? ' primary' : ''}`} onClick={() => onOpenPreview(agentId)}>
          Open Preview
        </button>
      </div>
      <div className="bc-steps">
        {steps.map((s, i) => (
          <div key={i} className={`bc-step ${s.state}`}>
            <i className={`bc-dot${s.state === 'now' ? ' live' : ''}`} aria-hidden="true" />
            <span className="bc-w">
              <b>{s.line.verb}</b>
              {s.line.target && <> <code>{s.line.target}</code></>}
              {s.line.detail && <> <span className="mut">{/^(in|to) /.test(s.line.detail) ? s.line.detail : `· ${s.line.detail}`}</span></>}
              {s.note && <span className="bc-note">{s.note}</span>}
              {s.line.file && <> <Shot agentId={agentId} file={s.line.file} onImage={onImage} /></>}
            </span>
            <span className="bc-x">{s.state === 'now' ? '…' : s.sec ? `${s.sec}s` : ''}</span>
          </div>
        ))}
      </div>
      {working && <div className="bc-bar" aria-hidden="true"><b /></div>}
      <button className="bc-fold" aria-expanded={raw} onClick={() => setRaw(!raw)}>
        {raw ? '▾ Hide' : '▸ Show'} the {n} {n === 1 ? 'command' : 'commands'}
      </button>
      {raw && (
        <div className="bc-raw">
          {group.calls.map((c) => (
            <ToolCard key={c.id} run={c.run} working={false} onImage={onImage} />
          ))}
        </div>
      )}
    </div>
  )
}
