/** What a program that was not found says about how to install it, as the detection reports it. */
interface Detection {
  state: string
  install?: string
}

/**
 * The command to install a program that was not found: the one the program itself gives, and only while it is not found. It comes from here and never
 * from the screen, so the screen cannot ask for anything else to be run. `AW_INSTALL_COMMAND` replaces it for a test, as `AW_CLAUDE_BIN` replaces the program.
 */
export function installCommand(detection: Detection, env: Record<string, string | undefined>): string | null {
  if (detection.state !== 'not-installed' || !detection.install) return null
  return env.AW_INSTALL_COMMAND || detection.install
}

/**
 * How to run it: by the person's own login shell (`-l`, so the installer sees their usual environment) with `-c`, so the terminal ends when the
 * installer does and the app looks again by itself. Null on Windows, where the command is for PowerShell and the person copies it.
 */
export function installLaunch(command: string, platform: NodeJS.Platform, shell: string | undefined): { file: string; args: string[] } | null {
  if (platform === 'win32') return null
  return { file: shell || '/bin/sh', args: ['-lc', command] }
}
