import { IconButton } from './IconButton'

/**
 * The last button of the header: hides the two top bars to give the page the whole window, and brings them back. Hidden, they slide down
 * while the pointer rests on the top edge (see barsPeek.ts); this button, in the bar that slid down, is how they come back for good.
 */
export function FullscreenButton({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return <IconButton icon={hidden ? 'shrink' : 'expand'} label={hidden ? 'Exit full screen' : 'Full screen'} tip={hidden ? 'Show the top bars again' : 'Hide the top bars; point at the top edge to see them'} pressed={hidden} onClick={onToggle} />
}
