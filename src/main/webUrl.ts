/** What a preview pane may show: a web page, on this computer or the internet. Files, scripts, data and the app's own pages are never reachable from it. */
export function isWebUrl(u: string): boolean {
  try {
    const x = new URL(u)
    return (x.protocol === 'http:' || x.protocol === 'https:') && x.hostname !== ''
  } catch {
    return false
  }
}
