import { _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Every launch gets a guaranteed teardown: a main-process error dialog blocks a normal close,
// so we kill the process ourselves and always remove the test's temp dir.
export async function launchApp(env: Record<string, string>, tmp: string) {
  const app = await electron.launch({ args: [resolve(__dirname, '..')], env: { ...(process.env as Record<string, string>), ...env } })
  const proc = app.process()
  const shutdown = async () => {
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    rmSync(tmp, { recursive: true, force: true })
  }
  return { app, shutdown }
}
