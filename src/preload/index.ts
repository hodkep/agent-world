import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AwApi } from '../shared/api'

const on =
  <A extends unknown[]>(channel: string) =>
  (cb: (...args: A) => void) => {
    const listener = (_: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
    ipcRenderer.on(channel, listener)
    return () => void ipcRenderer.removeListener(channel, listener)
  }

const api: AwApi = {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  listAgents: () => ipcRenderer.invoke('list-agents'),
  addAgent: (folder, options, name) => ipcRenderer.invoke('add-agent', folder, options, name),
  reconfigure: (id, change) => ipcRenderer.invoke('agent-reconfigure', id, change),
  wakeAgent: (id) => ipcRenderer.invoke('wake-agent', id),
  removeAgent: (id, mode) => ipcRenderer.invoke('remove-agent', id, mode),
  ptyWrite: (id, data) => ipcRenderer.send('pty-write', id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.send('pty-resize', id, cols, rows),
  ptyBuffer: (id) => ipcRenderer.invoke('pty-buffer', id),
  decide: (requestId, d) => ipcRenderer.send('decide', requestId, d),
  answerTrust: (agentId, trust) => ipcRenderer.send('answer-trust', agentId, trust),
  onAgentEvent: on('agent-event'),
  onPtyData: on('pty-data'),
  onPtyExit: on('pty-exit'),
  onPermission: on('permission'),
  onPermissionSettled: on('permission-settled'),
  onTrustPrompt: on('trust-prompt'),
  onAgentMessage: on('agent-message'),
  onAgentStats: on('agent-stats'),
  onBudgetAlert: on('budget-alert'),
  onSelectAgent: on('select-agent'),
  code: {
    changes: (id) => ipcRenderer.invoke('code:changes', id),
    diff: (id, path) => ipcRenderer.invoke('code:diff', id, path),
    files: (id) => ipcRenderer.invoke('code:files', id),
    read: (id, path) => ipcRenderer.invoke('code:read', id, path),
    write: (id, path, content) => ipcRenderer.invoke('code:write', id, path, content),
    commit: (id, message) => ipcRenderer.invoke('code:commit', id, message),
    discard: (id, path) => ipcRenderer.invoke('code:discard', id, path),
    merge: (id) => ipcRenderer.invoke('code:merge', id),
    pr: (id) => ipcRenderer.invoke('code:pr', id)
  }
}

contextBridge.exposeInMainWorld('aw', api)
