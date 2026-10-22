import type { RemoteState } from '../../shared/types'

export type RemoteAction = 'on' | 'off' | 'link' | 'qr'
export interface RemoteCommand { name: string; description: string; action: RemoteAction }

/** The palette verbs for an agent's remote control: only the ones that apply to its state. */
export function remoteCommands(agent: string, s: RemoteState): RemoteCommand[] {
  const off = { name: 'remote-off', description: `Turn off remote control for ${agent}`, action: 'off' } as const
  if (s.state === 'off') return [{ name: 'remote-on', description: `Turn on remote control for ${agent}: continue it from your phone`, action: 'on' }]
  if (s.state !== 'on') return [off]
  return [{ name: 'remote-link', description: `Copy the phone link for ${agent}`, action: 'link' }, { name: 'remote-qr', description: `Show a QR code to open ${agent} on your phone`, action: 'qr' }, off]
}

/** The chat's menu owns the confirm and the panel, so the palette asks it by an event. */
export const REMOTE_EVENT = 'aw:remote'
export const askRemote = (agentId: string, action: RemoteAction) => window.dispatchEvent(new CustomEvent(REMOTE_EVENT, { detail: { agentId, action } }))
