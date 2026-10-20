import { lstat, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Account, AccountInfo, AgentRecord, ProviderId } from '../shared/types'
import type { AccountSupport, Provider } from './providers/ports'

/** Each extra account keeps its sign-in, settings and conversations in a folder of its own under the app's home. */
export const accountDir = (home: string, id: string) => join(home, 'accounts', id)

/** A short folder-safe id from the name the user typed, never one already taken. */
export function accountId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'account'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** Makes an account's folder and links in what the program's own folder shares (instructions, skills…). The sign-in is never copied or linked; the program's own folder is only read. */
export async function prepareAccount(dir: string, support: AccountSupport) {
  await mkdir(dir, { recursive: true })
  for (const name of support.shared) {
    const from = join(support.ownHome(), name)
    const to = join(dir, name)
    if (!(await lstat(from).then(() => true, () => false))) continue
    if (await lstat(to).then(() => true, () => false)) continue
    await symlink(from, to).catch(() => undefined)
  }
}

/** What the service needs to know of the app; the rest it is given. */
export interface AccountDeps {
  /** The app's home: account folders live under it. */
  home: string
  providers(): readonly Provider[]
  /** The extra accounts the user added (Settings). */
  accounts(): Account[]
}

/**
 * Keeps logins of a program apart and moves agents between them. It knows nothing of any one program: each provider that
 * offers `accounts` says how its login is pointed at a folder, signed in and read. Adding a program means giving it that
 * support, not changing this class or the screens.
 */
export class AccountService {
  constructor(private readonly deps: AccountDeps) {}

  /** What a program offers for this, if anything. */
  support(provider: ProviderId | undefined): AccountSupport | undefined {
    return this.deps.providers().find((p) => p.id === (provider ?? 'claude'))?.accounts
  }

  /** The folder of a known account of this program; undefined for the program's own login, or for one that is gone or belongs to another program. */
  dirOf(provider: ProviderId | undefined, id: string | undefined): string | undefined {
    const a = id ? this.deps.accounts().find((x) => x.id === id) : undefined
    return a && a.provider === (provider ?? 'claude') && this.support(provider) ? accountDir(this.deps.home, a.id) : undefined
  }

  /** The environment that runs a program under a folder; nothing is added for its own login. */
  envFor(provider: ProviderId | undefined, configDir: string | undefined): Record<string, string> {
    return configDir ? (this.support(provider)?.env(configDir) ?? {}) : {}
  }

  /** Puts an agent on an account (its id and folder), or back on its program's own login when the id is empty or not usable. */
  assign(a: AgentRecord, id: string | undefined) {
    const dir = this.dirOf(a.provider, id)
    if (dir) Object.assign(a, { account: id, configDir: dir })
    else delete a.account, delete a.configDir
  }

  /** Creates an account's folder, ready for its sign-in. */
  async create(provider: ProviderId, name: string): Promise<Account> {
    const support = this.support(provider)
    if (!support) throw new Error('That program does not keep separate accounts.')
    const label = name.trim().slice(0, 40)
    if (!label) throw new Error('Give the account a name.')
    const mine = this.deps.accounts().filter((x) => x.provider === provider)
    if (mine.some((x) => x.name.toLowerCase() === label.toLowerCase())) throw new Error('An account with that name exists.')
    const id = accountId(label, this.deps.accounts().map((x) => x.id))
    await prepareAccount(accountDir(this.deps.home, id), support)
    return { id, name: label, provider }
  }

  /** Who is signed in under a folder (or on the program's own login), asked of the program. */
  status(provider: Provider, bin: string, configDir: string | undefined, base: NodeJS.ProcessEnv) {
    const support = provider.accounts
    if (!support) return Promise.resolve({ loggedIn: false, email: '' })
    return support.status(bin, { ...base, ...this.envFor(provider.id, configDir) })
  }

  /** What to run to sign an account in: the program under the account's folder, with its own sign-in arguments. */
  signIn(provider: ProviderId, id: string | undefined): { env: Record<string, string>; args: readonly string[] } {
    const support = this.support(provider)
    if (!support) throw new Error('That program does not keep separate accounts.')
    const dir = this.dirOf(provider, id)
    // The program's own login is signed in the way it always is (no arguments, no folder).
    return { env: this.envFor(provider, dir), args: dir ? support.signInArgs : [] }
  }

  /** Every login of every program that keeps accounts, with who is signed in and how many agents use it. */
  async list(agents: AgentRecord[], binOf: (p: Provider) => string, base: NodeJS.ProcessEnv): Promise<AccountInfo[]> {
    const own = (p: Provider): Account => ({ id: '', name: 'This computer', provider: p.id })
    const rows = this.deps.providers().flatMap((p) => (p.accounts ? [own(p), ...this.deps.accounts().filter((a) => a.provider === p.id)] : []))
    return Promise.all(
      rows.map(async (x) => {
        const p = this.deps.providers().find((q) => q.id === x.provider)!
        const dir = this.dirOf(p.id, x.id)
        const who = await this.status(p, binOf(p), dir, base)
        const shown = (dir ?? p.accounts!.ownHome()).replace(homedir(), '~')
        return { ...x, dir: shown, ...who, agents: agents.filter((a) => (a.provider ?? 'claude') === p.id && (a.account ?? '') === x.id).length }
      })
    )
  }

  /** The accounts with one relabelled. Only the label changes: its id, folder, sign-in and agents stay. A name another account of the program already has is refused. */
  rename(id: string, name: string): Account[] {
    const label = name.trim().slice(0, 40)
    if (!label) throw new Error('Give the account a name.')
    const all = this.deps.accounts()
    const target = all.find((x) => x.id === id)
    if (!target) throw new Error('That account was removed.')
    if (all.some((x) => x.id !== id && x.provider === target.provider && x.name.toLowerCase() === label.toLowerCase())) throw new Error('An account with that name exists.')
    return all.map((x) => (x.id === id ? { ...x, name: label } : x))
  }

  /** The accounts left after removing one; it refuses while an agent still runs on it. Its folder, and the sign-in in it, stay on disk. */
  without(id: string, agents: AgentRecord[]): Account[] {
    const busy = agents.filter((a) => a.account === id)
    if (busy.length) throw new Error(`${busy.map((a) => a.name).join(', ')} still ${busy.length === 1 ? 'runs' : 'run'} on it. Move ${busy.length === 1 ? 'it' : 'them'} to another account first.`)
    return this.deps.accounts().filter((x) => x.id !== id)
  }

  /** Lets an agent's conversation carry on under another account: the program makes it reachable from there. */
  moveConversation(a: AgentRecord, to: string | undefined) {
    const from = a.configDir
    this.assign(a, to)
    if (a.started) this.support(a.provider)?.shareConversation(a, from, a.configDir)
  }
}
