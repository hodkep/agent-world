import { BRAND, cssColor } from '../../shared/brand'
import { DEFAULT_PROVIDER, type ProviderId } from '../../shared/types'

/** A colour square for the program an agent runs on; the colour is what tells them apart, and the name is on hover. */
export const Swatch = ({ id, label }: { id: ProviderId | undefined; label: string }) => <i className="swatch" style={{ ['--c' as string]: cssColor(id ?? DEFAULT_PROVIDER) }} title={label} role="img" aria-label={label} />

/** Which program runs an agent; shown only once there is more than one to tell apart. */
export function ProviderTag({ id, label }: { id: ProviderId | undefined; label?: string }) {
  const p = id ?? DEFAULT_PROVIDER
  return (
    <span className="ptag" style={{ ['--c' as string]: cssColor(p) }} title={`Runs on ${label ?? BRAND[p].short}`}>
      {label ?? BRAND[p].short}
    </span>
  )
}
