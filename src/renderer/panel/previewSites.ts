import { isPreviewable } from '../links'

const KEY = 'aw.preview.sites'
type Store = Pick<Storage, 'getItem' | 'setItem'>

/** The host of an address, with its port, as the address shows it ("example.com", "192.168.1.20:3000"); empty when it is not an address. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

/** The sites the person said the Preview may show, on this computer. */
export function loadSites(s: Store = localStorage): string[] {
  try {
    const list = JSON.parse(s.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((h): h is string => typeof h === 'string' && h !== '') : []
  } catch {
    return []
  }
}

function save(s: Store, sites: string[]): string[] {
  try {
    s.setItem(KEY, JSON.stringify(sites))
  } catch {
    /* the choice just is not kept */
  }
  return sites
}

export const allowSite = (s: Store, host: string): string[] => {
  const now = loadSites(s)
  return now.includes(host) ? now : save(s, [...now, host])
}

export const forgetSite = (s: Store, host: string): string[] => save(s, loadSites(s).filter((h) => h !== host))

/** A page on this computer is the person's own and is shown at once; a site on the internet is shown after it was allowed once. */
export const needsAsking = (url: string, allowed: string[]): boolean => !isPreviewable(url) && !allowed.includes(hostOf(url))
