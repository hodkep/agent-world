import { posix, win32 } from 'node:path'

export interface GitProgram {
  /** The program to run. */
  bin: string
  /** The computer's own git, or the one bundled with the app. */
  source: 'system' | 'bundled'
  /** What the program needs in its environment to run from where it is (nothing for the computer's own). */
  env: Record<string, string>
  /** The folders that go first on the path of an agent terminal for a bundled one: its `git`, and on Windows the tools it runs. */
  pathDirs: string[]
}

interface Where {
  /** The folder of the app's resources: the bundled git is in `git/` there. */
  resourcesPath: string
  platform: NodeJS.Platform
  arch: string
  /** The PATH of the app, which is bare (/usr/bin:/bin:/usr/sbin:/sbin) when it was started from Finder. */
  path: string
  exists: (p: string) => boolean
  /** Whether Apple's command line tools (or Xcode) are installed: only then is the git at /usr/bin/git a git. */
  xcodeSelectOk: () => boolean
  /** Where the bundled git is when it is not in the app's resources (a build that is not packaged). */
  gitDir?: string
  /** `bundled` tries the bundled one first, to see how a computer with no git of its own fares. */
  prefer?: 'system' | 'bundled'
}

/** The folder of the Windows git that holds its programs (a 64-bit processor). */
const WIN_SUB = 'mingw64'

const pathMod = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix)

/** Where a Mac usually has a git of its own, besides the path: Homebrew on Apple silicon and on Intel. */
const MAC_PLACES = ['/opt/homebrew/bin/git', '/usr/local/bin/git']

/**
 * A git the computer has and that works. On a Mac with no command line tools, /usr/bin/git is a stub that opens Apple's installer when it is run
 * (and fails the call that ran it), so it counts only when `xcode-select -p` says the tools are there; it is never run to find out.
 */
function systemGit(o: Where): string | null {
  const m = pathMod(o.platform)
  const dirs = o.path.split(o.platform === 'win32' ? ';' : ':').filter(Boolean)
  const names = o.platform === 'win32' ? ['git.exe', 'git.cmd'] : ['git']
  const candidates = dirs.flatMap((d) => names.map((n) => m.join(d, n)))
  if (o.platform === 'darwin') candidates.push(...MAC_PLACES)
  for (const c of candidates) {
    if (!o.exists(c)) continue
    if (o.platform === 'darwin' && c === '/usr/bin/git' && !o.xcodeSelectOk()) continue
    return c
  }
  return null
}

/**
 * What the bundled git is given so it runs from wherever the app is installed: where its programs, system settings and templates are
 * (dugite-native's git is built to be moved), as GitHub Desktop sets them. `set` is what the person already set, which is left alone.
 */
export function bundledEnv(gitDir: string, platform: NodeJS.Platform, _path: string, set: Record<string, string | undefined> = {}, exists: (p: string) => boolean = () => false): Record<string, string> {
  const m = pathMod(platform)
  const env: Record<string, string> = {}
  if (platform === 'win32') {
    env.GIT_EXEC_PATH = set.GIT_EXEC_PATH ?? m.join(gitDir, WIN_SUB, 'libexec', 'git-core')
    return env
  }
  env.GIT_EXEC_PATH = set.GIT_EXEC_PATH ?? m.join(gitDir, 'libexec', 'git-core')
  if (!set.GIT_CONFIG_SYSTEM) env.GIT_CONFIG_SYSTEM = m.join(gitDir, 'etc', 'gitconfig')
  env.GIT_TEMPLATE_DIR = m.join(gitDir, 'share', 'git-core', 'templates')
  if (platform === 'linux') {
    env.PREFIX = gitDir
    const ca = m.join(gitDir, 'ssl', 'cacert.pem')
    if (!set.GIT_SSL_CAINFO && exists(ca)) env.GIT_SSL_CAINFO = ca
  }
  return env
}

/** The number of the version `git --version` printed ("git version 2.39.5 (Apple Git-154)"). */
export function parseGitVersion(out: string): string | undefined {
  return /git version (\d+\.\d+\.\d+)/.exec(out)?.[1]
}

/** The git to use: the computer's own when it has one that works, and otherwise the one bundled with the app; null when there is neither. */
export function resolveGit(o: Where & { env?: Record<string, string | undefined> }): GitProgram | null {
  const m = pathMod(o.platform)
  const dir = o.gitDir ?? m.join(o.resourcesPath, 'git')
  const bin = o.platform === 'win32' ? m.join(dir, 'cmd', 'git.exe') : m.join(dir, 'bin', 'git')
  const bundled = (): GitProgram | null => {
    if (!o.exists(bin)) return null
    const pathDirs = o.platform === 'win32' ? [m.dirname(bin), m.join(dir, WIN_SUB, 'bin'), m.join(dir, WIN_SUB, 'usr', 'bin')] : [m.dirname(bin)]
    return { bin, source: 'bundled', env: bundledEnv(dir, o.platform, o.path, o.env, o.exists), pathDirs }
  }
  const system = (): GitProgram | null => {
    const own = systemGit(o)
    return own ? { bin: own, source: 'system', env: {}, pathDirs: [m.dirname(own)] } : null
  }
  return o.prefer === 'bundled' ? (bundled() ?? system()) : (system() ?? bundled())
}

/**
 * The environment of an agent's terminal with the bundled git first on its path (and what it needs to run), so `git` in the terminal, in the
 * agent's own commands and in the commit hook is that git; the computer's own is left as it is.
 */
export function withGitOnPath(env: NodeJS.ProcessEnv, git: GitProgram | null, delimiter: string): NodeJS.ProcessEnv {
  if (!git || git.source !== 'bundled') return env
  return { ...env, ...git.env, PATH: [...git.pathDirs, env.PATH].filter(Boolean).join(delimiter) }
}
