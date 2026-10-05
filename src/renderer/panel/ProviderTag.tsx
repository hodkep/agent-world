import type { ProviderId } from '../../shared/types'

const LABEL: Record<ProviderId, string> = { claude: 'Claude Code', agy: 'agy' }

/** Which program runs an agent; shown only once there is more than one to tell apart. */
export function ProviderTag({ id, label }: { id: ProviderId | undefined; label?: string }) {
  const p = id ?? 'claude'
  return (
    <span className={`ptag ${p}`} title={`Runs on ${label ?? LABEL[p]}`}>
      {label ?? LABEL[p]}
    </span>
  )
}
