import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { AwApi } from '../shared/api'

const on =
  <A extends unknown[]>(channel: string) =>
  (cb: (...args: A) => void) => {
    const listener = (_: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
    ipcRenderer.on(channel, listener)
    return () => void ipcRenderer.removeListener(channel, listener)
  }

const api: AwApi = {
  pathOf: (file) => webUtils.getPathForFile(file),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getWorkspaces: () => ipcRenderer.invoke('workspaces:get'),
  activateWorkspace: (path) => ipcRenderer.invoke('workspaces:activate', path),
  forgetWorkspace: (path) => ipcRenderer.invoke('workspaces:forget', path),
  listAgents: () => ipcRenderer.invoke('list-agents'),
  addAgent: (folder, options, name) => ipcRenderer.invoke('add-agent', folder, options, name),
  reconfigure: (id, change) => ipcRenderer.invoke('agent-reconfigure', id, change),
  setGroup: (id, group) => ipcRenderer.invoke('set-group', id, group),
  renameAgent: (id, name) => ipcRenderer.invoke('rename-agent', id, name),
  requestReview: (authorId, reviewer) => ipcRenderer.invoke('handoff-review', authorId, reviewer),
  cloneAgent: (id) => ipcRenderer.invoke('clone-agent', id),
  listHistory: (folder) => ipcRenderer.invoke('list-history', folder),
  resumeSession: (folder, id) => ipcRenderer.invoke('resume-session', folder, id),
  listTools: (id) => ipcRenderer.invoke('list-tools', id),
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
  listProcs: (id: string) => ipcRenderer.invoke('procs:list', id),
  stopProc: (id: string, pid: number) => ipcRenderer.invoke('procs:stop', id, pid),
  getServers: () => ipcRenderer.invoke('get-servers'),
  onServers: on('servers'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  chatGet: (id) => ipcRenderer.invoke('chat:get', id),
  onChatItems: on('chat-items'),
  onChatReset: on('chat-reset'),
  chatSend: (id, text) => ipcRenderer.invoke('chat:send', id, text),
  saveAttachment: (id, name, bytes, mime) => ipcRenderer.invoke('attach-save', id, name, new Uint8Array(bytes), mime),
  readImage: (id, path) => ipcRenderer.invoke('read-image', id, path),
  setMode: (id, mode) => ipcRenderer.invoke('chat:set-mode', id, mode),
  chatCycleMode: (id) => ipcRenderer.invoke('chat:cycle-mode', id),
  onTerminalMenu: on('terminal-menu'),
  answerMenu: (id, i) => ipcRenderer.invoke('menu:answer', id, i),
  onComposerPrefill: on('composer-prefill'),
  cancelMenu: (id) => ipcRenderer.invoke('menu:cancel', id),
  rewindTo: (id, text) => ipcRenderer.invoke('rewind-to', id, text),
  chatInterrupt: (id) => ipcRenderer.invoke('chat:interrupt', id),
  listRoles: (folder) => ipcRenderer.invoke('roles:list', folder),
  saveRole: (r) => ipcRenderer.invoke('roles:save', r),
  deleteRole: (id) => ipcRenderer.invoke('roles:delete', id),
  getUsage: () => ipcRenderer.invoke('get-usage'),
  onUsage: on('usage'),
  onBudgetAlert: on('budget-alert'),
  onPlanMenu: on('plan-menu'),
  listCommands: (id) => ipcRenderer.invoke('list-commands', id),
  runCommand: (id, name, args) => ipcRenderer.invoke('run-command', id, name, args),
  answerPlan: (id, choice, feedback) => ipcRenderer.invoke('answer-plan', id, choice, feedback),
  onQuestionMenu: on('question-menu'),
  answerQuestions: (id, answers) => ipcRenderer.invoke('answer-question', id, answers),
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

// Diagnostics only (AW_DEBUG=1): not part of the typed API.
contextBridge.exposeInMainWorld('awDebug', { screen: (id: string) => ipcRenderer.invoke('debug:screen', id) })
contextBridge.exposeInMainWorld('aw', api)
