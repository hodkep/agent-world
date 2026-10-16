import { Glyph, Sprite } from '../pixel/Pixels'
import type { GlyphName } from '../pixel/glyphs'
import type { Station, Track } from '../../shared/runTrack'

const GLYPH: Record<Station['kind'], GlyphName> = { plan: 'plan', work: 'flag', approve: 'check', check: 'check', audit: 'review', merge: 'land' }
const WORD: Record<Station['state'], string> = { done: 'met', trouble: 'met after trouble', failed: 'failed', now: 'here now', next: 'not yet', skipped: 'not asked' }

/**
 * Where one open run stands: its steps as stations on a rail, the agent standing on the one it is at, and a speech bubble when it waits on the person.
 * Shown above the agent's chat while a task is open (and again in its Workflow tab), so the calls that move the run need no lines in the conversation.
 */
export function RunTrack({ track, seed, agentName }: { track: Track; seed: string; agentName: string }) {
  return (
    <div className="run-track" role="region" aria-label={`${track.title}: where ${agentName} is`}>
      <div className="rt-head">
        <b>{track.title}</b>
        <span>{track.workflow}</span>
        {track.round > 1 && <em>round {track.round}</em>}
      </div>
      <ol className={`track ${track.waiting ? 'hb' : ''}`}>
        {track.stations.map((s, i) => {
          const mark = s.state === 'done' || s.state === 'trouble' ? 'check' : s.state === 'failed' ? 'cross' : GLYPH[s.kind]
          return (
            <li key={s.id} className={`st ${s.state} ${i > 0 && ['done', 'trouble', 'skipped'].includes(track.stations[i - 1]!.state) ? 'rail-on' : ''}`}>
              {i === track.at && (
                <span className="agent">
                  {track.waiting && <span className="bubble" role="status">{track.waiting}</span>}
                  <Sprite seed={seed} />
                </span>
              )}
              <i className="sq">
                <Glyph name={mark} cell={2} />
                {s.tries ? <b className="tn">{s.tries}</b> : null}
              </i>
              <span className="nm" title={s.name}>{s.name}</span>
              <span className="sr-only"> ({WORD[s.state]}{s.tries ? `, ${s.kind === 'plan' ? 'sent back' : 'failed'} ${s.tries === 1 ? 'once' : `${s.tries} times`}` : ''})</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
