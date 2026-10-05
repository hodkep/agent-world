import type { ProviderId } from '../../shared/types'

const LABEL: Record<ProviderId, string> = { claude: 'Claude Code', agy: 'agy' }

/** A colour square for the program an agent runs on; the colour is what tells them apart, and the name is on hover. */
export const Swatch = ({ id, label }: { id: ProviderId | undefined; label: string }) => <i className={`swatch ${id ?? 'claude'}`} title={label} role="img" aria-label={label} />

/** Which program runs an agent; shown only once there is more than one to tell apart. */
export function ProviderTag({ id, label }: { id: ProviderId | undefined; label?: string }) {
  const p = id ?? 'claude'
  return (
    <span className={`ptag ${p}`} title={`Runs on ${label ?? LABEL[p]}`}>
      {label ?? LABEL[p]}
    </span>
  )
}
