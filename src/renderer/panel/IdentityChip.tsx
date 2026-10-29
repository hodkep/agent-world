/** Beside the project name: who this project's agents and terminals act as. Amber when that login is signed out; a click opens the pane where it is changed. */
export function IdentityChip({ line, onOpen }: { line: { text: string; out: boolean } | null; onOpen: () => void }) {
  if (!line) return null
  return (
    <button className={`idc${line.out ? ' out' : ''}`} onClick={onOpen} title={line.out ? 'This GitHub login is signed out on this machine. Click to fix it.' : 'The GitHub login agents and terminals act as in this project. Click to change it.'}>
      <i aria-hidden="true" />
      {line.text}
    </button>
  )
}
