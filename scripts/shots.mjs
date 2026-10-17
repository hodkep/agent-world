// Takes every picture of the README and the user guide from the real app, driven by fake agents (no tokens, no sign-in), and saves them in docs/images.
// It needs ffmpeg for the hero GIF (brew install ffmpeg). Run: pnpm shots
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status !== 0) {
  console.error('ffmpeg is needed for the hero GIF: brew install ffmpeg (or your system\'s package manager).')
  process.exit(1)
}
run('pnpm', ['exec', 'electron-vite', 'build'])
run('pnpm', ['exec', 'playwright', 'test', 'e2e/shots.e2e.ts', '--workers=1', '--retries=0'], { AW_SHOTS: '1' })
run('pnpm', ['readme:art'])
