import { useEffect, useState } from 'react'
import { sentence, type Action } from '../../shared/browserAction'

/** A command that ran this recently counts as the tool being at work. */
export const ACTING_MS = 2000

/**
 * The frame round an agent's Preview page while its browser tool is connected, with a tab on its bottom edge: the agent's name, what it is doing in a pill with what it is
 * done to beside it ("alpha CLICKING “Sign in”"), and a cross that disconnects it (it may connect again on its next command; the switch in Settings turns tools off for good).
 * Brass while a command has just run, dim while quiet (then it says what was done last); red when the tool asked for something that is not allowed.
 * While the agent has set a size on the page, a chip at the frame's top corner says which.
 */
export function BrowserFrame({ who, connections, at, now, action, size, onDisconnect }: { who: string; connections: number; at: number; method?: string; now?: number; action?: Action; size?: { w: number; h: number; label: string } | null; onDisconnect: () => void }) {
  const [, tick] = useState(0)
  const t = now ?? Date.now()
  const left = ACTING_MS - (t - at)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => tick((n) => n + 1), left + 20)
    return () => clearTimeout(timer)
  }, [at, left])
  if (connections === 0) return null
  const acting = left > 0
  const refused = acting && !!action?.refused
  const said = acting && action ? action : null
  return (
    <>
      <div className={`browser-frame${acting ? ' acting' : ''}${refused ? ' refused' : ''}`} aria-hidden="true" />
      {size && <div className="browser-size" title={`${who} has set the page to this size`}>{size.w} × {size.h} · {size.label}</div>}
      <div className={`browser-tab${acting ? ' acting' : ''}${refused ? ' refused' : ''}`} role="status" aria-label={said ? `${who} is ${sentence(said)}` : undefined}>
        <i aria-hidden="true" className={acting ? 'live' : ''} />
        {said ? (
          <>
            <span className="who">{who}</span>
            <span className="pill">{said.pill}</span>
            {said.target && <span className="tgt">{said.target}</span>}
          </>
        ) : (
          <span>
            {who} is {acting ? 'browsing' : 'connected'}
            {connections > 1 ? ` · ${connections} tools` : ''}
            {!acting && action ? ` · last: ${sentence(action)}` : ''}
          </span>
        )}
        <button onClick={onDisconnect} aria-label={`Disconnect ${who}’s browser tool`} title={`Disconnect ${who}’s browser tool now. It may connect again on its next command; the switch in Settings turns tools off for good`}>
          ✕
        </button>
      </div>
    </>
  )
}
