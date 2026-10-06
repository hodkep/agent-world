import { cssColor } from '../../shared/brand'
import type { ProviderId } from '../../shared/types'
import claudeLogo from '../assets/claude-logo.svg'
import agyLogo from '../assets/agy-logo.png'

/** The programs' own logos: Claude's spark (from the simple-icons set) and Antigravity's mark (from its app). */
/** Each program's mark: one line to add for another program. */
const LOGOS: Record<ProviderId, string> = { claude: claudeLogo, agy: agyLogo }

/** `tint` draws a one-colour logo in the program's own colour, for dark backgrounds where its plain black would vanish. */
/** The logos drawn in one colour (a plain shape that takes whatever colour it is given); the others carry their own. */
const MONO = new Set<ProviderId>(['claude'])

export function ProviderLogo({ id, size = 24, tint = false }: { id: ProviderId; size?: number; tint?: boolean }) {
  if (tint && MONO.has(id)) return <i className="plogo" role="presentation" style={{ width: size, height: size, background: cssColor(id), WebkitMaskImage: `url("${LOGOS[id]}")`, maskImage: `url("${LOGOS[id]}")` }} />
  return <img src={LOGOS[id]} width={size} height={size} alt="" draggable={false} />
}
