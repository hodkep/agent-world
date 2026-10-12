import { DIALS, type Dial, dialName, dialSummary, workflowCost } from '../../shared/workflows'
import { groupTokens } from '../panel/libraryCost'

/** What workflows add to one task at each dial level, on assumptions printed under the table. With `onDial` the dial can be chosen here. */
export function WorkflowCost({ dial, onDial }: { dial: Dial; onDial?: (d: Dial) => void }) {
  return (
    <div className="wf-cost">
      {onDial && (
        <div className="wf-seg" role="radiogroup" aria-label="How much care a workflow takes">
          {DIALS.map((d) => (
            <button key={d} role="radio" aria-checked={dial === d} className={dial === d ? 'on' : ''} onClick={() => onDial(d)}>
              {dialName(d)}
            </button>
          ))}
        </div>
      )}
      <table className="su-cost" aria-label="What workflows add per task">
        <caption>Added to the agent's context for one task of about five steps, on these assumptions. Estimates, not measurements.</caption>
        <tbody>
          {DIALS.map((d) => (
            <tr key={d} aria-current={dial === d ? 'true' : undefined} className={dial === d ? 'pick' : ''}>
              <th scope="row">{dialName(d)}</th>
              <td>{dialSummary(d)}</td>
              <td className="n">≈ {groupTokens(workflowCost(d).perTask)} tokens</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Assumes {workflowCost('max').parts.map((p) => `${p.label.toLowerCase()} ≈ ${groupTokens(p.tokens)}`).join(', ')} tokens. A cheaper model on economy can still lower what a task costs.
      </p>
    </div>
  )
}
