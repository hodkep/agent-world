import type { ReactNode } from 'react'
import type { Described, Policy, ProbeResult } from '../../shared/mcp'
import { statusOf } from './mcpView'

export const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/** An on/off switch at the end of a row. */
export function Switch({ on, label, disabled, word, onChange }: { on: boolean; label: string; disabled?: boolean; word?: string; onChange: (on: boolean) => void }) {
  return (
    <button className={`mt-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} title={label} onClick={() => onChange(!on)}>
      <i aria-hidden />
      <span>{word ?? (on ? 'on' : 'off')}</span>
    </button>
  )
}

const WORDS: [Policy, string, string][] = [['allow', 'Allow', 'a'], ['ask', 'Ask', 'q'], ['deny', 'Deny', 'd']]

/** Allow, Ask or Deny for one tool. Clicking the one that is on goes back to no rule, which leaves it to the agent's permission mode. `only` limits the choices (agy can only be told no). */
export function Policy3({ value, label, only, disabled, onChange }: { value: Policy | undefined; label: string; only?: Policy[]; disabled?: boolean; onChange: (p: Policy | null) => void }) {
  return (
    <span className="mt-seg" role="group" aria-label={label}>
      {WORDS.map(([p, word, c]) => (
        <button key={p} className={`${c}${value === p ? ' on' : ''}`} aria-pressed={value === p} disabled={disabled || (!!only && !only.includes(p))} title={value === p ? 'Click to leave it to the agent’s permission mode' : undefined} onClick={() => onChange(value === p ? null : p)}>{word}</button>
      ))}
    </span>
  )
}

/** The bars of Used in 30 days, one for each project, biggest first. */
export function Bars({ rows, empty = 'Not used in the last 30 days.' }: { rows: [string, number][]; empty?: string }): ReactNode {
  const top = rows[0]?.[1] ?? 1
  if (!rows.length) return <p className="hint">{empty}</p>
  return (
    <div className="sk2-used">
      {rows.map(([name, n]) => (
        <div key={name} className="sk2-u"><span title={name}>{name}</span><i style={{ width: `${Math.max(6, Math.round((n / top) * 100))}%` }} aria-hidden /><b>{n}×</b></div>
      ))}
    </div>
  )
}

/** Connected, Failed, Needs sign-in, Timed out or Not connected, as a small label. */
export function StatusChip({ probe, busy }: { probe: ProbeResult | undefined; busy?: boolean }) {
  const s = statusOf(probe, !!busy)
  return <span className={`mt-st ${s.tone}`} role="status">{s.word}</span>
}

/** What a connection said, in a line: the status, why when it did not work, and how long it took. */
export function ProbeLine({ probe }: { probe: ProbeResult }) {
  return (
    <p className={`mt-probe ${probe.status}`} role="status">
      <StatusChip probe={probe} />
      <span>{probe.status === 'connected' ? `${probe.server ? `${probe.server.name} ${probe.server.version} · ` : ''}${(probe.ms / 1000).toFixed(1)} s` : probe.message}</span>
    </p>
  )
}

/**
 * What starting an entry that comes with a project would run, exactly as the office worked it out: the command and each argument on its own, or the address and its headers, every
 * variable with its value, and the folder it runs in. A variable that changes how a program loads is called out. Nothing starts until Run it.
 */
export function ConfirmRun({ name, file, d, onRun, onCancel }: { name: string; file: string; d: Described; onRun: () => void; onCancel: () => void }) {
  return (
    <div className="sk2-note mt-ask" role="alertdialog" aria-label={`Run ${name}?`}>
      <div className="mt-ask-body">
        <b>Run {name} from this project?</b>
        <span>It comes with the project, in <span className="mono">{file}</span>, not from you. Starting it runs this on this computer:</span>
        {d.url ? (
          <code className="mt-cmd">{d.url}</code>
        ) : (
          <code className="mt-cmd">{[d.command ?? '(no command)', ...d.args].map((a, i) => <span key={i} className="mt-arg">{a}</span>)}</code>
        )}
        {d.cwd && <span className="hint">in the folder <span className="mono">{d.cwd}</span></span>}
        {(d.env.length > 0 || d.headers.length > 0) && (
          <dl className="mt-env">
            {[...d.env.map((e) => ({ ...e, kind: 'variable' })), ...d.headers.map((e) => ({ ...e, kind: 'header' }))].map((e) => (
              <div key={`${e.kind}:${e.name}`}><dt>{e.name}</dt><dd className="mono">{e.value}</dd></div>
            ))}
          </dl>
        )}
        {d.risky.length > 0 && <p className="mt-risky" role="note">It sets {d.risky.join(', ')}, which can change how programs start or what they load: read them before you run it.</p>}
      </div>
      <button className="primary" onClick={onRun}>Run it</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}
