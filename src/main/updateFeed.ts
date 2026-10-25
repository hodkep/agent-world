export type UpdateFeed = { kind: 'github' } | { kind: 'off'; detail: string }

/** Where an installed app looks for a newer build: the releases of the project on GitHub, which the build bakes into the app. A build that is not installed looks nowhere. */
export function updateFeed(packaged: boolean): UpdateFeed {
  return packaged ? { kind: 'github' } : { kind: 'off', detail: 'Updates only work in the installed app.' }
}
