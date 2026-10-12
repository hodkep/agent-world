import type { ProviderInfo } from '../../shared/types'
import { LibraryOff } from './LibraryOff'
import { LibraryPane } from './LibraryPane'
import { Modal } from './Modal'

/** The library in a large window of its own, opened from the top bar: the shelf, the playbook beside the exact words an agent is told, and what was reached for. */
export function LibraryModal({ folder, providers, enabled, onOpenSettings, onClose }: { folder: string; providers: ProviderInfo[]; enabled: boolean; onOpenSettings: () => void; onClose: () => void }) {
  return (
    <Modal label="Library" className="library-modal" onClose={onClose}>
      <header className="settings-head">
        <b>Library</b>
        <small className="lib-lead">Skills, instructions and prompts kept once, for every program. A playbook says which an agent is told and when.</small>
        <button onClick={onClose} aria-label="Close library">Close</button>
      </header>
      <fieldset className="lib-scroll">
        {enabled ? <LibraryPane folder={folder} providers={providers} /> : <LibraryOff onOpenSettings={onOpenSettings} />}
      </fieldset>
    </Modal>
  )
}
