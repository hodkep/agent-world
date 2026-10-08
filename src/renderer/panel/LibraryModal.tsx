import type { ProviderInfo } from '../../shared/types'
import { LibraryPane } from './LibraryPane'
import { Modal } from './Modal'

/** The library in a large window of its own, opened from the top bar: the shelf, the playbook beside the exact words an agent is told, and what was reached for. */
export function LibraryModal({ folder, providers, onClose }: { folder: string; providers: ProviderInfo[]; onClose: () => void }) {
  return (
    <Modal label="Library" className="library-modal" onClose={onClose}>
      <header className="settings-head">
        <b>Library</b>
        <small className="lib-lead">Skills, instructions and prompts kept once, for every program. A playbook says which an agent is told and when.</small>
        <button onClick={onClose} aria-label="Close library">Close</button>
      </header>
      <fieldset className="lib-scroll">
        <LibraryPane folder={folder} providers={providers} />
      </fieldset>
    </Modal>
  )
}
