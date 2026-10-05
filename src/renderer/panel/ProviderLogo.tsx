import type { ProviderId } from '../../shared/types'

// Claude Code's spark: ten rays of uneven length around a centre. agy's mark: the arch of its "A" with a bar, as in its app icon.
const RAYS = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324]

export function ProviderLogo({ id }: { id: ProviderId }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor" stroke="currentColor">
      {id === 'claude' ? (
        RAYS.map((a, i) => <line key={a} x1="12" y1="12" x2="12" y2={i % 2 ? 3.5 : 1.5} strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${a} 12 12)`} />)
      ) : (
        <>
          <path d="M3 21 L12 3 L21 21" fill="none" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M8.5 15.5 H15.5" fill="none" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
