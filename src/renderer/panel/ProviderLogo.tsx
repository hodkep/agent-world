import type { ProviderId } from '../../shared/types'
import claudeLogo from '../assets/claude-logo.svg'
import agyLogo from '../assets/agy-logo.png'

/** The programs' own logos: Claude's spark (from the simple-icons set) and Antigravity's mark (from its app). */
/** Each program's mark: one line to add for another program. */
const LOGOS: Record<ProviderId, string> = { claude: claudeLogo, agy: agyLogo }

export function ProviderLogo({ id }: { id: ProviderId }) {
  return <img src={LOGOS[id]} width={24} height={24} alt="" draggable={false} />
}
