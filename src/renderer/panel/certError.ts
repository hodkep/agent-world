/** A page that did not load because of its certificate: Chromium's errors -200 to -219 (expired, wrong name, untrusted, revoked...). */
export const isCertError = (code: number | undefined): boolean => code !== undefined && code <= -200 && code >= -219

/** The host of an https page the person chose to open past a bad certificate (the address bar says it is not secure); empty for anything else. */
export function insecureHost(url: string, allowed: string[]): string {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && allowed.includes(u.hostname.toLowerCase()) ? u.hostname.toLowerCase() : ''
  } catch {
    return ''
  }
}
