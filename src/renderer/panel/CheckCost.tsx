import { checkCost, groupTokens } from './libraryCost'

/** What "Check before acting" adds to an agent's context, on assumptions a person can read; shown wherever the switch is. */
export function CheckCost() {
  const cost = checkCost()
  return (
    <div className="td-cost">
      <table className="su-cost" aria-label="What the check adds, on these assumptions">
        <caption>Added to every message while a rule is hard: about <b>{cost.perMessage} tokens</b>. On these assumptions:</caption>
        <tbody>
          {cost.scenarios.map((x) => <tr key={x.label}><th scope="row">{x.label}</th><td>{x.messages} messages</td><td className="n">≈ {groupTokens(x.tokens)} tokens</td></tr>)}
        </tbody>
      </table>
      <p className="hint">Plus about {cost.perSkip} tokens each time an agent passes a rule over and says why. Estimates: the real figure depends on caching and on how you work.</p>
    </div>
  )
}
