import type { ProviderId } from '../../shared/types'
import claudeLogo from '../assets/claude-logo.svg'
import agyLogo from '../assets/agy-logo.png'

/** The programs' own logos: Claude's spark (from the simple-icons set) and Antigravity's mark (from its app). */
export function ProviderLogo({ id }: { id: ProviderId }) {
  return <img src={id === 'claude' ? claudeLogo : agyLogo} width={24} height={24} alt="" draggable={false} />
}
