import { DIALS, type Dial, dialDoes, dialName, dialSummary, workflowCost } from '../../shared/workflows'
import { formatCallCost } from '../../shared/runStats'
import { groupTokens } from '../panel/libraryCost'

/**
 * What workflows add to one task at each dial level: what lands in the agent's own context, and what a separate model call uses,
 * on assumptions printed under the table. With `onDial` the dial can be chosen here, and a line says what the chosen level does.
 */
export function WorkflowCost({ dial, onDial }: { dial: Dial; onDial?: (d: Dial) => void }) {
  const full = workflowCost('max')
  return (
    <div className="wf-dial">
      {onDial && (
        <>
          <div className="wf-seg" role="radiogroup" aria-label="How much care a workflow takes">
            {DIALS.map((d) => (
              <button key={d} role="radio" aria-checked={dial === d} className={dial === d ? 'on' : ''} onClick={() => onDial(d)}>
                {dialName(d)}
              </button>
            ))}
          </div>
          <p className="hint wf-does">{dialDoes(dial)}</p>
        </>
      )}
      <table className="su-cost" aria-label="What workflows add per task">
        <caption>For one task of about five steps. Estimates, except the audit's size and price on haiku, which were measured.</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Adds</th>
            <th scope="col">In the agent's context</th>
            <th scope="col">Separate model calls</th>
          </tr>
        </thead>
        <tbody>
          {DIALS.map((d) => {
            const c = workflowCost(d)
            const audit = c.parts.find((p) => p.label === 'Merge audit')
            return (
              <tr key={d} aria-current={dial === d ? 'true' : undefined} className={dial === d ? 'pick' : ''}>
                <th scope="row">{dialName(d)}</th>
                <td>{dialSummary(d)}</td>
                <td className="n">≈ {groupTokens(c.context)} tokens</td>
                <td className="n">{c.calls ? `≈ ${groupTokens(c.calls)} tokens${audit?.usd !== undefined ? ` · ${formatCallCost(audit.usd)} an audit` : ''}` : 'none'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint">
        Assumes {full.parts.map((p) => `${p.label.toLowerCase()} ≈ ${groupTokens(p.tokens)}`).join(', ')} tokens. The audit and the intent check run as their own calls under the agent's account, so they cost usage but add nothing to its context.
      </p>
    </div>
  )
}
