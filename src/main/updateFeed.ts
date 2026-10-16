export type UpdateFeed = { kind: 'github' } | { kind: 'generic'; url: string } | { kind: 'off'; detail: string }

/**
 * Where an installed app looks for a newer build: the address typed in Settings (a folder that serves the files electron-builder
 * produces) when there is one, and otherwise the releases of the project on GitHub, which the build bakes into the app.
 */
export function updateFeed(address: string, packaged: boolean): UpdateFeed {
  if (!packaged) return { kind: 'off', detail: 'Updates only work in the installed app.' }
  const url = address.trim()
  if (!url) return { kind: 'github' }
  return /^https?:\/\//i.test(url) ? { kind: 'generic', url } : { kind: 'off', detail: 'The update address must start with http:// or https://.' }
}
