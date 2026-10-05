/**
 * The folder under the user's home where the app keeps its agents, notes and settings. A build of the app can name its own
 * (`awHome` in its package.json) so it never shares data with another install of the same app; anything but a plain folder name is ignored.
 */
export function homeDirName(packageJson: string): string {
  try {
    const name = (JSON.parse(packageJson) as { awHome?: unknown }).awHome
    return typeof name === 'string' && /^\.?[\w-]+$/.test(name) ? name : '.agent-world'
  } catch {
    return '.agent-world'
  }
}
