import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { RemoteState } from '../../shared/types'
import { askRemote, remoteCommands } from '../chat/remoteCommands'

type Item = Omit<PaletteCommand, 'source'> & { source: PaletteCommand['source'] | 'office' }

/** ⌘K: run a Claude built-in, skill or custom command in the selected agent. "review auth" = /review auth. */
export function Palette({ agentId, agentName, remote, onClose, onRun }: { agentId: string; agentName: string; /** Present when the agent's program can be continued from a phone: its verbs are listed with the commands. */ remote?: RemoteState; onClose: () => void; onRun: (name: string, args: string) => Promise<void> }) {
  const [listed, setCommands] = useState<PaletteCommand[]>([])
  const commands = useMemo<Item[]>(() => [...(remote ? remoteCommands(agentName, remote).map((c) => ({ name: c.name, description: c.description, source: 'office' as const, args: false })) : []), ...listed], [listed, remote, agentName])
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
    void window.aw.listCommands(agentId).then(setCommands)
  }, [agentId])

  const [word, ...rest] = query.replace(/^\//, '').split(' ')
  const args = rest.join(' ')
  const shown = useMemo(() => {
    const q = (word ?? '').toLowerCase()
    return commands.filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)).slice(0, 12)
  }, [commands, word])
  useEffect(() => setAt(0), [word])

  const run = async (c: Item | undefined) => {
    if (!c) return
    const own = remote && remoteCommands(agentName, remote).find((r) => r.name === c.name)
    if (own) askRemote(agentId, own.action)
    else await onRun(c.name, c.args ? args : '')
    onClose()
  }

  return (
    <dialog ref={dialog} className="palette" aria-label={`Commands for ${agentName}`} onClose={onClose} onCancel={onClose}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setAt((i) => Math.min(shown.length - 1, i + 1))
          else if (e.key === 'ArrowUp') setAt((i) => Math.max(0, i - 1))
          else if (e.key === 'Enter') void run(shown[at])
          else return
          e.preventDefault()
        }}
        placeholder={`Command for ${agentName}, e.g. review focus on auth`}
        aria-label="Command"
        aria-controls="palette-list"
        aria-activedescendant={shown[at] ? `cmd-${shown[at]!.name}` : undefined}
        autoFocus
      />
      <ul id="palette-list" role="listbox" aria-label="Commands">
        {shown.map((c, i) => (
          <li key={c.name} id={`cmd-${c.name}`} role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => void run(c)}>
            <span className="name">/{c.name}</span>
            <span className="desc">{c.description}</span>
            <span className="src">{c.source}</span>
          </li>
        ))}
        {shown.length === 0 && <li className="empty">No matching command.</li>}
      </ul>
    </dialog>
  )
}
