/** The notice that agy is not connected, as a small button on the tab line: the whole sentence is its tooltip, and a click goes to Message box. */
export function AgyChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="lib-chip" title="agy is not connected. Its agents get the always-on rules and the catalog, but no line for the message they are sent. Click to connect it under Message box." onClick={onOpen}>
      <i aria-hidden />agy not connected
    </button>
  )
}
