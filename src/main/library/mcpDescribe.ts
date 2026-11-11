import { createHash } from 'node:crypto'
import type { Described } from '../../shared/mcp'
import { maskEntry } from './mcpEdit'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
/** Variables that change how a program loads or finds what it runs: a project's entry setting one can make a harmless-looking command load its own code. */
const RISKY = /^(PATH|NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|PYTHONPATH|PYTHONSTARTUP|PYTHONHOME|RUBYOPT|RUBYLIB|PERL5OPT|PERL5LIB|BASH_ENV|ENV|CLASSPATH|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|NPM_CONFIG_.*)$/i

const pairs = (v: unknown) => (isObj(v) ? Object.entries(v).map(([name, value]) => ({ name, value: String(value) })) : [])

/** The same text for the same entry whatever order its keys came in. */
const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null')

export const digestOf = (def: Obj, cwd?: string): string => createHash('sha256').update(stable({ def, cwd: cwd ?? null })).digest('hex')

/** What starting this entry would run, by the rule the probe uses to choose between an address and a command (an address that is text wins), with the digest of what is described. */
export function describeEntry(def: Obj, cwd?: string): Described {
  const digest = digestOf(def, cwd)
  if (typeof def.url === 'string') return { url: def.url, args: [], env: [], headers: pairs(def.headers), risky: [], digest }
  const env = pairs(def.env)
  return {
    ...(typeof def.command === 'string' && { command: def.command }),
    args: Array.isArray(def.args) ? def.args.map(String) : [],
    env,
    headers: [],
    ...(cwd && { cwd }),
    risky: env.filter((e) => RISKY.test(e.name)).map((e) => e.name),
    digest
  }
}

/**
 * What the window is told. An entry that comes with a project is described whole (its values are the project's, and the person must read them); any other entry keeps its
 * values back, so the window can never be handed a secret. The digest is always of the real entry, which is what a start is checked against.
 */
export function describeForScreen(def: Obj, cwd: string | undefined, reveal: boolean): Described {
  const d = describeEntry(reveal ? def : maskEntry(def), cwd)
  return { ...d, digest: digestOf(def, cwd) }
}
