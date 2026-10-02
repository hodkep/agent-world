/** One column per label; heights are relative to the tallest, and each column says its exact value to a screen reader. */
export function Bars({ rows, show, label }: { rows: { label: string; value: number; full?: string }[]; show: (n: number) => string; label: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  return (
    <div className="st-bars" role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${show(r.value)}`).join(', ')}`}>
      <span className="st-axis">{max > 0 ? show(max) : ''}</span>
      {rows.map((r, i) => (
        <div key={`${i}`} className="st-col" tabIndex={0} data-tip={`${r.full ?? r.label}: ${show(r.value)}`}>
          <i style={{ height: `${max > 0 ? Math.max(r.value > 0 ? 3 : 0, (r.value / max) * 100) : 0}%` }} />
          <small>{r.label}</small>
        </div>
      ))}
    </div>
  )
}

/** Days down, hours across; a cell is brighter the more work it holds. */
export function Heat({ rows, days }: { rows: number[][]; days: string[] }) {
  const max = Math.max(...rows.flat(), 0)
  return (
    <div className="st-heat" role="img" aria-label="Activity by day and hour">
      <div className="st-heat-top">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ gridColumn: h + 1 }}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((row, d) => (
        <div key={days[d]} className="st-heat-row">
          <span>{days[d]!.slice(0, 1)}</span>
          <div>
            {row.map((ms, h) => (
              <i key={h} tabIndex={0} style={{ opacity: ms > 0 && max > 0 ? 0.25 + 0.75 * (ms / max) : 0.08 }} data-tip={`${days[d]} ${h}:00 · ${Math.round(ms / 60_000)} min of work`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
