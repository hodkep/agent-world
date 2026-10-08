import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** What a terminal needs to start a shell that tells the app where each prompt is and how the last command ended (OSC 133, as VS Code's does). */
export interface ShellStart {
  args: string[]
  env: Record<string, string>
}

const MARK = String.raw`printf '\033]133;D;%s\007\033]133;A\007' "$__aw_status"`

// Each of the user's own files is read first, so nothing of theirs is lost; ours comes last in .zshrc.
const zshFile = (name: string, last = '') =>
  `__aw_zd="$ZDOTDIR"; ZDOTDIR="\${AW_USER_ZDOTDIR:-$HOME}"; [[ -f "$ZDOTDIR/${name}" ]] && . "$ZDOTDIR/${name}"; ${last ? '' : 'ZDOTDIR="$__aw_zd"'}\n${last}`

const ZSHRC_TAIL = `__aw_precmd() { __aw_status=$?; ${MARK}; }
precmd_functions=(__aw_precmd $precmd_functions)
ZDOTDIR="\${AW_USER_ZDOTDIR:-$HOME}"; [[ "$ZDOTDIR" == "$HOME" ]] && unset ZDOTDIR; unset __aw_zd
`

const BASH = `[ -r /etc/profile ] && . /etc/profile
for f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do [ -r "$f" ] && . "$f" && break; done
__aw_prompt() { __aw_status=$?; ${MARK}; return $__aw_status; }
PROMPT_COMMAND="__aw_prompt\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
`

/** Writes the start-up files into `dir` and says how to start `shell` with them. Shells other than zsh and bash start as before. */
export function shellIntegration(shell: string, dir: string, userZdotdir = ''): ShellStart {
  const name = basename(shell)
  if (name === 'zsh') {
    const z = join(dir, 'zsh')
    mkdirSync(z, { recursive: true })
    for (const f of ['.zshenv', '.zprofile', '.zlogin']) writeFileSync(join(z, f), zshFile(f))
    writeFileSync(join(z, '.zshrc'), zshFile('.zshrc', ZSHRC_TAIL))
    return { args: ['-l'], env: { ZDOTDIR: z, AW_USER_ZDOTDIR: userZdotdir } }
  }
  if (name === 'bash') {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'bash.sh')
    writeFileSync(file, BASH)
    return { args: ['--init-file', file], env: {} }
  }
  return { args: ['-l'], env: {} }
}
