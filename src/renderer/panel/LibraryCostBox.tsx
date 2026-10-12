import { groupTokens, libraryCost } from './libraryCost'

/** What the library and playbook add to an agent's context, on assumptions a person can read; shown wherever the switch is. */
export function LibraryCostBox() {
  const c = libraryCost()
  return (
    <div className="td-cost">
      <table className="su-cost" aria-label="What the library and playbook add, on these assumptions">
        <caption>The opening text carries what your playbook tells every agent: up to <b>{c.openingMax} tokens</b> once per session. A message that points at an item adds about <b>{c.perPointing}</b>. On these assumptions:</caption>
        <tbody>
          {c.sessions.map((s) => <tr key={s.label}><th scope="row">{s.label}</th><td>{s.pointings} {s.pointings === 1 ? 'pointing' : 'pointings'}</td><td className="n">≈ {groupTokens(s.tokens)} tokens</td></tr>)}
        </tbody>
      </table>
      <p className="hint">Off: agents are told nothing from the library, and its window and tab say so. Estimates: the real figure depends on your playbook and on how you work.</p>
    </div>
  )
}
