import { useState } from 'react'
import { mixSize, type GroupBy, type MixRow, type TokenMix } from '../../shared/tokenMix'
import { isProviderId, type ProviderInfo } from '../../shared/types'
import { tokenLabel } from '../../shared/usage'
import { ProviderTag } from '../panel/ProviderTag'
import { AcctName, type AcctView } from './acct'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'provider', label: 'Provider' },
  { id: 'account', label: 'Account' },
  { id: 'agent', label: 'Agent' },
  { id: 'project', label: 'Project' },
  { id: 'model', label: 'Model' }
]

const count = (n: number | null) => (n === null ? '—' : tokenLabel(n))
const share = (s: number | null) => (s === null ? '—' : `${Math.round(s * 100)}%`)

/** Fresh input, cache read, cache write and output as one bar; the part counted before requests were exact has no split and is hatched. */
export function MixBar({ r, tall }: { r: Pick<MixRow, 'input' | 'cacheRead' | 'cacheWrite' | 'output' | 'legacy'>; tall?: boolean }) {
  const total = r.input + (r.cacheRead ?? 0) + (r.cacheWrite ?? 0) + r.output + r.legacy
  const w = (n: number | null) => ({ width: `${total > 0 ? ((n ?? 0) / total) * 100 : 0}%` })
  return (
    <i className={`st-mix${tall ? ' tall' : ''}`} role="img" aria-label={`fresh input ${count(r.input)}, cache read ${count(r.cacheRead)}, cache write ${count(r.cacheWrite)}, output ${count(r.output)}${r.legacy ? `, ${tokenLabel(r.legacy)} with no split` : ''}`}>
      <b className="m-in" style={w(r.input)} />
      <b className="m-rd" style={w(r.cacheRead)} />
      <b className="m-wr" style={w(r.cacheWrite)} />
      <b className="m-out" style={w(r.output)} />
      <b className="m-old" style={w(r.legacy)} />
    </i>
  )
}

function Key({ r }: { r: MixRow }) {
  return (
    <div className="st-mixkey">
      <span><s className="m-in" />fresh input {count(r.input)}</span>
      <span><s className="m-rd" />cache read {count(r.cacheRead)}</span>
      <span><s className="m-wr" />cache write {count(r.cacheWrite)}</span>
      <span><s className="m-out" />output {count(r.output)}</span>
      {r.legacy > 0 && <span><s className="m-old" />no split {tokenLabel(r.legacy)}</span>}
    </div>
  )
}

/** Where the tokens went, grouped by whichever of program, account, agent, project or model is chosen. */
export function TokensTab({ mix, days, providers, view }: { mix: TokenMix; days: number; providers: ProviderInfo[]; view: (key: string) => AcctView | undefined }) {
  const [by, setBy] = useState<GroupBy>('agent')
  const rows = mix.groups[by]
  const name = (r: MixRow) => {
    if (by === 'provider' && isProviderId(r.provider)) return <ProviderTag id={r.provider} label={providers.find((p) => p.id === r.provider)?.label ?? r.provider} />
    if (by === 'account') return view(r.key) ? <AcctName v={view(r.key)!} /> : r.key
    return r.name
  }
  return (
    <>
      <div className="st-row">
        <h3>Where the tokens go <span className="lm-hint">grouped by</span></h3>
        <span className="st-seg" role="group" aria-label="Group by">
          {GROUPS.map((g) => <button key={g.id} aria-pressed={by === g.id} className={by === g.id ? 'on' : ''} onClick={() => setBy(g.id)}>{g.label}</button>)}
        </span>
      </div>
      {mixSize(mix.total) === 0 ? (
        <p className="st-note">Nothing recorded in this time.</p>
      ) : (
        <>
          <section>
            <h3>All, {days} days · {tokenLabel(mixSize(mix.total))} tokens</h3>
            <MixBar r={mix.total} tall />
            <Key r={mix.total} />
          </section>
          <section>
            <table className="st-table st-tokens">
              <thead><tr><th>{GROUPS.find((g) => g.id === by)!.label}</th><th>Mix</th><th>Fresh input</th><th>Cache read</th><th>Cache write</th><th>Output</th><th>Cache</th><th>Spent</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{name(r)}</td>
                    <td><MixBar r={r} /></td>
                    <td>{count(r.input)}</td>
                    <td title={r.cacheRead === null ? 'Not reported by this program' : undefined}>{count(r.cacheRead)}</td>
                    <td title={r.cacheWrite === null ? 'Not reported by this program' : undefined}>{count(r.cacheWrite)}</td>
                    <td>{count(r.output)}</td>
                    <td>{share(r.share)}</td>
                    <td>{r.usd > 0 ? `$${r.usd.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <p className="st-note">A dash is a figure the program does not report. Cache is the part of what was read that came from the program's cache, over requests counted exactly{mix.total.legacy > 0 ? `; ${tokenLabel(mix.total.legacy)} tokens from before that was counted have no split and show hatched` : ''}.</p>
    </>
  )
}
