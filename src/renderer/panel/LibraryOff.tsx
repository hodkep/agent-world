/** What the Library says when the feature is switched off: it is off, what that means, and a way to the switch. */
export function LibraryOff({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="lib-off" role="note" aria-label="The library is off">
      <b>The library and playbook are turned off</b>
      <p>Agents are told nothing from them, and they can't be changed here until you turn them on. Your items and playbooks are kept as they are.</p>
      <button className="primary" onClick={onOpenSettings}>Open Settings → Features</button>
    </div>
  )
}
