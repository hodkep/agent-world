import { allowedHost } from './manifest'

const SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const TEST_TOOLS = ['AW_DITTO', 'AW_CODESIGN', 'AW_OPEN', 'AW_PLISTBUDDY', 'AW_MV']

/**
 * The environment the helper that replaces the app is started with. The helper reads its tools from AW_* variables so that a test can stand in for them,
 * so in the installed app none may reach it (an environment could otherwise replace the signature check): it gets a fixed path and the home folder,
 * and nothing else. Only a build that is not installed passes the test overrides on.
 */
export function helperEnv(packaged: boolean, env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { PATH: SAFE_PATH }
  if (env.HOME) out.HOME = env.HOME
  if (!packaged) for (const k of TEST_TOOLS) if (env[k]) out[k] = env[k]!
  return out
}

export interface ReleaseOrigins {
  /** Where the latest release is asked for, and where release files are downloaded from. */
  api: string
  downloads: string
  /** Whether an address may be fetched, at the start and after each redirect. */
  allow: (address: string) => boolean
  /** True when a test's own server stands in for GitHub. */
  testing: boolean
}

/**
 * GitHub, always, in the installed app. A build that is not installed (a test run) may point `AW_UPDATE_RELEASES` at a server of its own, a plain
 * http(s) origin, and then that origin is the only one allowed; an installed app ignores the variable altogether.
 */
export function releaseOrigins(packaged: boolean, env: NodeJS.ProcessEnv): ReleaseOrigins {
  const github: ReleaseOrigins = { api: 'https://api.github.com', downloads: 'https://github.com', allow: allowedHost, testing: false }
  const raw = env.AW_UPDATE_RELEASES?.trim()
  if (packaged || !raw) return github
  try {
    const u = new URL(raw)
    if (!/^https?:$/.test(u.protocol) || u.pathname !== '/' || u.search || u.hash || u.username) return github
    const origin = u.origin
    return { api: `${origin}/api`, downloads: origin, allow: (a) => { try { return new URL(a).origin === origin } catch { return false } }, testing: true }
  } catch {
    return github
  }
}
