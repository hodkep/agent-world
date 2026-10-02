import type { AgentOptions } from './types'

/** A ready-made agent: the launch settings and standing instructions for a kind of job. */
export interface Role {
  id: string
  title: string
  blurb: string
  source: 'built-in' | 'project' | 'your' | 'saved'
  /** A name to offer when hiring one (the user can change it). */
  nameHint?: string
  options: AgentOptions
}

/** An agent's options after taking a new job (null: no job): the old role, its instructions and its permission mode go; model, effort and the rest stay. */
export function withRole(options: AgentOptions | undefined, role: Role | null): AgentOptions {
  const { role: _r, instructions: _i, permissionMode: _p, ...keep } = options ?? {}
  if (!role) return keep
  const { model, ...job } = role.options
  return { ...keep, ...job, ...(model && { model }), role: role.title }
}

const READ_ONLY = 'Read and run read-only commands only. Never edit, create or delete files, and never commit.'

/** The crew every project starts with: common jobs, each with sensible permissions and standing instructions. */
export const BUILT_IN_ROLES: Role[] = [
  {
    id: 'explorer',
    title: 'Explorer',
    blurb: 'Reads the codebase and answers questions. Changes nothing.',
    source: 'built-in',
    nameHint: 'scout',
    options: { permissionMode: 'plan', instructions: `You are a codebase explorer. ${READ_ONLY} Answer with file paths and line numbers, and say what you are unsure about.` }
  },
  {
    id: 'reviewer',
    title: 'Reviewer',
    blurb: 'Reviews branches for bugs, risks and missing tests. Read-only.',
    source: 'built-in',
    nameHint: 'rex',
    options: { permissionMode: 'plan', instructions: `You are a code reviewer. ${READ_ONLY} Report concrete findings ordered by severity, each with the file and line, and a suggested fix.` }
  },
  {
    id: 'tester',
    title: 'Test writer',
    blurb: 'Writes and runs tests next to the existing ones.',
    source: 'built-in',
    nameHint: 'tess',
    options: { permissionMode: 'acceptEdits', instructions: 'You write and run tests. Follow the existing test style and put tests beside the code they cover. Change production code only when a test cannot be written without it, and say so.' }
  },
  {
    id: 'fixer',
    title: 'Bug fixer',
    blurb: 'Reproduces a bug, finds the cause, makes the smallest fix.',
    source: 'built-in',
    nameHint: 'fixie',
    options: { instructions: 'You fix bugs. Reproduce first, ideally with a failing test. Find the root cause, make the smallest change that fixes it, and explain what was wrong.' }
  },
  {
    id: 'refactorer',
    title: 'Refactorer',
    blurb: 'Cleans up code without changing what it does.',
    source: 'built-in',
    nameHint: 'ren',
    options: { instructions: 'You refactor. Preserve behaviour exactly. Work in small steps, run the tests after each one, and stop and ask if a change would alter behaviour.' }
  },
  {
    id: 'docs',
    title: 'Docs writer',
    blurb: 'Writes short, accurate docs and checks the commands in them.',
    source: 'built-in',
    nameHint: 'doc',
    options: { permissionMode: 'acceptEdits', instructions: 'You write documentation: short, accurate, and in the project\'s voice. Run every command you put in a doc to be sure it works.' }
  },
  {
    id: 'security',
    title: 'Security auditor',
    blurb: 'Looks for injection, auth gaps, secrets and unsafe input. Read-only.',
    source: 'built-in',
    nameHint: 'sentry',
    options: { permissionMode: 'plan', instructions: `You audit code for security problems: injection, broken authorisation, leaked secrets, unsafe deserialisation, path traversal. ${READ_ONLY} Rank findings and show how each could be exploited.` }
  }
]

/** The three that make a useful first team. */
export const STARTER_CREW = ['explorer', 'tester', 'reviewer']
