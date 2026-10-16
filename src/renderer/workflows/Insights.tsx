import { useState } from 'react'
import { type GateName, type Tile, type TileKind, columnRates, gateTiles, runsWithin, says } from '../../shared/insights'
import type { Run } from '../../shared/runs'
import type { StepContext } from '../../shared/steps'
import { OutlineIcon } from '../panel/IconButton'

const GATES: { gate: GateName; label: string }[] = [{ gate: 'plan', label: 'Plan' }, { gate: 'check', label: 'Check' }, { gate: 'review', label: 'Review' }, { gate: 'land', label: 'Land' }, { gate: 'told', label: 'Told' }]
const WORD: Record<TileKind, string> = { ok: 'met first time', trouble: 'met after trouble', bad: 'missed or overridden', na: 'not asked', wait: 'waiting' }
const MAX_ROWS = 12

function TileView({ tile }: { tile: Tile }) {
  const label = `${GATES.find((g) => g.gate === tile.gate)!.label}: ${WORD[tile.kind]}${tile.kind === 'trouble' && tile.n ? ` (${tile.n})` : ''}`
  return (
    <span role="cell" className="mo-c" aria-label={label} title={label}>
      <i className={`mo-t ${tile.kind}`}>{tile.kind === 'trouble' && tile.n ? tile.n : tile.kind === 'bad' ? <OutlineIcon name="cross" size={12} /> : null}</i>
    </span>
  )
}

const rate = (good: number, of: number, what: string) => (of === 0 ? { big: '—', what } : { big: `${good} of ${of}`, what })

/** The Insights tab: a tile for every gate of every run, so what keeps slipping shows down a column and the bad run shows along a row; the footer is the numbers. */
export function Insights({ runs, ctxFor, now }: { runs: Run[]; ctxFor: (r: Run) => StepContext; now: number }) {
  const [days, setDays] = useState<7 | 30>(7)
  const shown = [...runsWithin(runs, days, now)].reverse()
  const rows = shown.map((r) => ({ run: r, title: r.title, tiles: gateTiles(r, ctxFor(r)) }))
  const rates = columnRates(rows.map((r) => r.tiles))
  const notes = says(rows)
  const foot = [rate(rates.plan.good, rates.plan.of, 'plans approved as sent'), rate(rates.check.good, rates.check.of, 'checks first try'), rate(rates.review.good, rates.review.of, 'findings seen'), rates.land.of === 0 ? { big: '—', what: 'landings' } : { big: rates.land.of === rates.land.good ? 'none' : `${rates.land.of - rates.land.good} anyway`, what: 'landings' }, rate(rates.told.good, rates.told.of, 'announced')]
  return (
    <div className="mo">
      <div className="mo-span" role="radiogroup" aria-label="How far back">
        {([7, 30] as const).map((d) => <button key={d} role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d} days</button>)}
      </div>
      {rows.length === 0 ? (
        <p className="hint">No runs in the last {days} days.</p>
      ) : (
        <div className="mo-grid" role="table" aria-label="Gates met by each run">
          <div role="row" className="mo-row mo-head">
            <span role="columnheader" />
            {GATES.map((g) => <span key={g.gate} role="columnheader" className="mo-h">{g.label}</span>)}
          </div>
          {rows.slice(0, MAX_ROWS).map(({ run, title, tiles }) => (
            <div key={run.id} role="row" className="mo-row">
              <span role="rowheader" className="mo-nm">{title}<small>{run.name}</small></span>
              {tiles.map((t) => <TileView key={t.gate} tile={t} />)}
            </div>
          ))}
          {rows.length > MAX_ROWS && <p className="hint" role="row">…and {rows.length - MAX_ROWS} earlier runs.</p>}
          <div role="row" className="mo-row mo-foot">
            <span role="rowheader" className="mo-nm"><span className="sr-only">Over these runs</span></span>
            {foot.map((f) => <span key={f.what} role="cell" className="mo-rate"><b>{f.big}</b>{f.what}</span>)}
          </div>
        </div>
      )}
      {notes.length > 0 && <div className="mo-says">{notes.map((n) => <p key={n}>{n}</p>)}</div>}
    </div>
  )
}
