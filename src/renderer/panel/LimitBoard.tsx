import type { BoardRow } from '../../shared/limits'
import { limitBoard } from '../../shared/limits'
import { BRAND, cssColor } from '../../shared/brand'
import { type LimitWindow, type Prefs, type ProviderInfo } from '../../shared/types'
import { untilReset } from '../../shared/usage'
import { accountColor, accountName } from '../accounts'

const LED = 10
const level = (pct: number) => (pct < 15 ? 'hot' : pct < 30 ? 'warn' : 'ok')

/** One window as a strip of ten lights that go out from the right as it is used up, with what is left and when it refills under it. */
function Strip({ w, now }: { w: LimitWindow | null; now: number }) {
  if (!w) return <div className="lbd-cell"><span className="lbd-leds" aria-hidden="true">{Array.from({ length: LED }, (_, i) => <i key={i} />)}</span><span className="lbd-note">not reported</span></div>
  // A window whose reset has passed is full again, whatever it last said.
  const pct = Date.parse(w.resetsAt) <= now ? 100 : Math.round(w.remainingPct)
  return (
    <div className="lbd-cell" role="img" aria-label={`${pct}% left, resets in ${untilReset(Date.parse(w.resetsAt), now)}`}>
      <span className="lbd-leds" data-l={level(pct)}>{Array.from({ length: LED }, (_, i) => <i key={i} className={i < Math.round(pct / 10) ? 'on' : ''} />)}</span>
      <span className="lbd-note"><b>{pct}%</b> · {untilReset(Date.parse(w.resetsAt), now)}</span>
    </div>
  )
}

function Row({ row, accounts, now }: { row: BoardRow; accounts: Prefs['accounts']; now: number }) {
  return (
    <>
      <span className={`lbd-name ${row.sub ? 'sub' : ''}`}>
        {row.account !== undefined && !row.sub && <i className="acct-dot" style={{ background: accountColor(accounts, row.account) }} />}
        {row.sub && <span aria-hidden="true">↳</span>}
        {row.label}
      </span>
      <Strip w={row.five} now={now} />
      <Strip w={row.week} now={now} />
    </>
  )
}

/** The usage-limit board on the plant's tooltip: a block per program, a row per login, each window as a strip of lights. */
export function LimitBoard({ pool, accounts, own, providers }: { pool: LimitWindow[]; accounts: Prefs['accounts']; own?: Prefs['ownNames']; providers: ProviderInfo[] }) {
  const now = Date.now()
  const board = limitBoard(pool, { provider: (id) => providers.find((p) => p.id === id)?.label ?? BRAND[id].short, account: (id, provider) => accountName(accounts, id, provider, own), keeps: (id) => accounts.some((a) => a.provider === id) })
  return (
    <div className="lbd">
      {board.map((b) => (
        <section key={b.provider} className="lbd-prov">
          <h4><i className="lbd-logo" style={{ background: cssColor(b.provider) }} />{b.label}</h4>
          <div className="lbd-grid">
            <span />
            <span className="lbd-h">5-hour</span>
            <span className="lbd-h">Weekly</span>
            {b.rows.map((r) => <Row key={r.key} row={r} accounts={accounts} now={now} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
