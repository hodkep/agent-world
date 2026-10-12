import { trackingCost } from '../../shared/todoTracking'

const group = (n: number) => n.toLocaleString('en-US')

/** What fully tracked todos add to an agent's context, on assumptions a person can read; shown wherever the choice is made. */
export function TrackingCost({ full }: { full: boolean }) {
  const d = trackingCost('deferred')
  const f = trackingCost('full')
  const extra = f.opening - d.opening
  return (
    <div className="td-cost">
      <table className="su-cost" aria-label="What fully tracked todos add, on these assumptions">
        <caption>
          {full
            ? <>Every request you send also becomes a task, so each adds about <b>{f.perRequest} tokens</b> (a reminder and the call that finishes it), plus <b>{extra}</b> more in the opening text once per session.</>
            : <>Off: the opening text carries about <b>{d.opening} tokens</b> once per session and nothing is added to messages. Switching on adds about <b>{f.perRequest}</b> per request. On these assumptions:</>}
        </caption>
        <tbody>
          {f.sessions.map((s, i) => (
            <tr key={s.label}>
              <th scope="row">{s.label}</th>
              <td>{s.requests} requests</td>
              <td className="n">+≈ {group(s.tokens - d.sessions[i]!.tokens)} tokens</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Estimates: the real figure depends on caching and on how you work. Either way you can add tasks by hand, and agents add one when you ask in plain words.</p>
    </div>
  )
}
