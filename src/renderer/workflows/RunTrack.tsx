import { Glyph, Sprite } from '../pixel/Pixels'
import type { GlyphName } from '../pixel/glyphs'
import type { Station, Track } from '../../shared/runTrack'

const GLYPH: Record<Station['kind'], GlyphName> = { plan: 'plan', work: 'flag', approve: 'check', check: 'check', audit: 'review', merge: 'land' }
const WORD: Record<Station['state'], string> = { done: 'met', trouble: 'met after trouble', failed: 'failed', now: 'here now', next: 'not yet', skipped: 'not asked' }

/**
 * Where one open run stands: its steps as stations on a rail, the agent standing on the one it is at, and a speech bubble when it waits on the person.
 * Shown above the agent's chat while a task is open (and again in its Workflow tab), so the calls that move the run need no lines in the conversation.
 */
export function RunTrack({ track, seed, agentName, variant = 'full' }: { track: Track; seed: string; agentName: string; /** `bar`: one thin row for above the chat; `full`: the track with the agent standing on its station. */ variant?: 'full' | 'bar' }) {
  const word = (s: Station) => `${WORD[s.state]}${s.tries ? `, ${s.kind === 'plan' ? 'sent back' : 'failed'} ${s.tries === 1 ? 'once' : `${s.tries} times`}` : ''}`
  const mark = (s: Station): GlyphName => (s.state === 'done' || s.state === 'trouble' ? 'check' : s.state === 'failed' ? 'cross' : GLYPH[s.kind])
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
                <Glyph name={mark(s)} cell={1} />
                {s.tries ? <b className="tn">{s.tries}</b> : null}
              </i>
              <span className="nm">{s.name}</span>
              <span className="sr-only"> ({word(s)})</span>
            </li>
          ))}
        </ol>
        {(track.waiting ?? track.note) && <span className="pill" role="status" title={track.waiting ?? track.note}>{track.waiting ?? track.note}</span>}
      </div>
    )
  return (
    <div className="run-track" role="region" aria-label={`${track.title}: where ${agentName} is`}>
      <div className="rt-head">
        <b>{track.title}</b>
        <span>{track.workflow}</span>
        {track.round > 1 && <em>round {track.round}</em>}
      </div>
      <ol className={`track ${track.waiting ?? track.note ? 'hb' : ''}`}>
        {track.stations.map((s, i) => {
          return (
            <li key={s.id} className={`st ${s.state} ${railOn(i) ? 'rail-on' : ''}`}>
              {i === track.at && (
                <span className="agent">
                  {(track.waiting ?? track.note) && <span className="bubble" role="status">{track.waiting ?? track.note}</span>}
                  <Sprite seed={seed} />
                </span>
              )}
              <i className="sq">
                <Glyph name={mark(s)} cell={2} />
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
