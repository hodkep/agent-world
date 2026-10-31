import { type HeaderIconName, OutlineIcon } from '../panel/IconButton'
import { Sprite } from '../pixel/Pixels'
import type { LandingPill, Station, Track } from '../../shared/runTrack'

const ICON: Record<Station['kind'], HeaderIconName> = { plan: 'file', work: 'terminal', approve: 'tick', check: 'tick', audit: 'search', pr: 'flag', merge: 'flag' }
const WORD: Record<Station['state'], string> = { done: 'met', trouble: 'met after trouble', failed: 'failed', now: 'here now', next: 'not yet', skipped: 'skipped' }

/**
 * Where one open run stands: its steps as stations on a rail, the agent standing on the one it is at, and a speech bubble when it waits on the person.
 * Shown above the agent's chat while a task is open (and again in its Workflow tab), so the calls that move the run need no lines in the conversation.
 */
export function RunTrack({ track, seed, agentName, variant = 'full', landing, onReopen }: { track: Track; seed: string; agentName: string; /** `bar`: one thin row for above the chat; `full`: the track with the agent standing on its station. */ variant?: 'full' | 'bar'; /** Git held the agent's merge: the marker that says so, in place of what the run waits for. */ landing?: LandingPill | null; /** The person opens the band again from a marker they had said not yet to. */ onReopen?: () => void }) {
  const said = landing?.text ?? track.waiting ?? track.note
  const word = (s: Station) => `${WORD[s.state]}${s.tries ? `, ${s.kind === 'plan' ? 'sent back' : 'failed'} ${s.tries === 1 ? 'once' : `${s.tries} times`}` : ''}`
  const mark = (s: Station): HeaderIconName => (s.state === 'done' || s.state === 'trouble' ? 'tick' : s.state === 'failed' ? 'cross' : s.state === 'skipped' ? 'forward' : ICON[s.kind])
  const railOn = (i: number) => i > 0 && ['done', 'trouble', 'skipped'].includes(track.stations[i - 1]!.state)
  if (variant === 'bar')
    return (
      <div className="run-track bar" role="region" aria-label={`${track.title}: where ${agentName} is`}>
        <Sprite seed={seed} cell={2} />
        <span className="rt-title"><b>{track.title}</b><small>{track.workflow}{track.round > 1 ? ` · round ${track.round}` : ''}</small></span>
        <ol className="bar-st">
          {track.stations.map((s, i) => (
            <li key={s.id} className={`st ${s.state} ${railOn(i) ? 'rail-on' : ''}`} title={`${s.name}: ${word(s)}`}>
              <i className="sq">
                <OutlineIcon name={mark(s)} size={12} />
                {s.tries ? <b className="tn">{s.tries}</b> : null}
              </i>
              <span className="nm">{s.name}</span>
              <span className="sr-only"> ({word(s)})</span>
            </li>
          ))}
        </ol>
        {landing ? (
          <button className={`pill land ${landing.kind}`} title={landing.kind === 'notyet' ? 'Open the held merge again' : 'The merge into the base branch is held: decide below'} onClick={landing.kind === 'notyet' ? onReopen : undefined}>
            <OutlineIcon name="flag" size={12} />
            {landing.text}
          </button>
        ) : (
          said && <span className="pill" role="status" title={said}>{said}{track.again && <button className="su-link" onClick={() => void window.aw.workflows.askAgain(track.run, track.again!)}>Ask again</button>}</span>
        )}
      </div>
    )
  return (
    <div className="run-track" role="region" aria-label={`${track.title}: where ${agentName} is`}>
      <div className="rt-head">
        <b>{track.title}</b>
        <span>{track.workflow}</span>
        {track.round > 1 && <em>round {track.round}</em>}
      </div>
      <ol className={`track ${said ? 'hb' : ''}`}>
        {track.stations.map((s, i) => {
          return (
            <li key={s.id} className={`st ${s.state} ${railOn(i) ? 'rail-on' : ''}`}>
              {i === track.at && (
                <span className="agent">
                  {said && <span className="rt-bubble" role="status">{said}</span>}
                  <Sprite seed={seed} />
                </span>
              )}
              <i className="sq">
                <OutlineIcon name={mark(s)} size={14} />
                {s.tries ? <b className="tn">{s.tries}</b> : null}
              </i>
              <span className="nm" title={s.name}>{s.name}</span>
              <span className="sr-only"> ({word(s)})</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
