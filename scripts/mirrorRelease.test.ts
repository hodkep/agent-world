import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// scripts/mirror-release.sh run for real, with stand-ins for `gh` (the GitHub release) and `rclone` (the R2 bucket, a folder here), so nothing leaves the machine.
const SCRIPT = resolve(__dirname, 'mirror-release.sh')
const GH = `#!/bin/bash
# release download <tag> --repo R --dir D --pattern P ... : copies the fixture files that match a pattern; fails like gh when none does.
if [ "$1 $2" = "release download" ]; then
  [ -n "$GH_BROKEN" ] && { echo "HTTP 502: bad gateway" >&2; exit 1; }
  shift 3; dir=""; pats=()
  while [ $# -gt 0 ]; do case "$1" in --dir) dir="$2"; shift 2;; --pattern) pats+=("$2"); shift 2;; *) shift;; esac; done
  n=0
  for f in "$FIXTURE"/*; do b=$(basename "$f"); [ "$b" = digests.txt ] && continue
    for p in "\${pats[@]}"; do case "$b" in $p) cp "$f" "$dir/$b"; n=$((n+1)); break;; esac; done
  done
  [ $n -gt 0 ] || { echo "no assets match the file pattern" >&2; exit 1; }
  exit 0
fi
# api repos/.../releases/tags/<tag> --jq ... : the "name digest" lines the script reads.
[ "$1" = api ] && { cat "$FIXTURE/digests.txt"; exit 0; }
exit 1
`
const RCLONE = `#!/bin/bash
echo "rclone $*" >> "$LOG"
map() { case "$1" in r2:agent-world-releases*) echo "$FAKE_BUCKET\${1#r2:agent-world-releases}";; *) echo "$1";; esac; }
cmd="$1"; shift; args=(); inc=()
while [ $# -gt 0 ]; do case "$1" in --include) inc+=("$2"); shift 2;; --*) shift;; *) args+=("$1"); shift;; esac; done
case "$cmd" in
  copy) src=$(map "\${args[0]}"); dst=$(map "\${args[1]}"); mkdir -p "$dst"
    for f in "$src"/*; do [ -f "$f" ] || continue; b=$(basename "$f"); ok=0; [ \${#inc[@]} -eq 0 ] && ok=1
      for p in "\${inc[@]}"; do case "$b" in $p) ok=1;; esac; done
      [ $ok = 1 ] && cp "$f" "$dst/$b"; done;;
  copyto) src=$(map "\${args[0]}"); dst=$(map "\${args[1]}"); mkdir -p "$(dirname "$dst")"; cp "$src" "$dst";;
  size) f=$(map "\${args[0]}"); echo "{\\"count\\":1,\\"bytes\\":$(wc -c < "$f" | tr -d ' ')}";;
  lsf) p=$(map "\${args[0]}"); if [ -f "$p" ]; then basename "$p"; elif [ -d "$p" ]; then for e in "$p"/*; do [ -d "$e" ] && echo "$(basename "$e")/"; done; fi;;
  purge) rm -rf "$(map "\${args[0]}")";;
  check) ;;
esac
exit 0
`

let dirs: string[] = []
afterEach(() => {
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  dirs = []
})

/** A release with these files, and a bucket that already holds the Mac files of that version (as after PHASE=upload). */
const setup = (ver: string, files: Record<string, string>, wrongDigest: string[] = []) => {
  const root = mkdtempSync(join(tmpdir(), 'mirror-'))
  dirs.push(root)
  const bin = join(root, 'bin'), fixture = join(root, 'release'), bucket = join(root, 'bucket')
  for (const d of [bin, fixture, join(bucket, `v${ver}`)]) mkdirSync(d, { recursive: true })
  writeFileSync(join(bin, 'gh'), GH)
  writeFileSync(join(bin, 'rclone'), RCLONE)
  chmodSync(join(bin, 'gh'), 0o755)
  chmodSync(join(bin, 'rclone'), 0o755)
  const digests: string[] = []
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(fixture, name), text)
    const sha = wrongDigest.includes(name) ? '0'.repeat(64) : createHash('sha256').update(text).digest('hex')
    digests.push(`${name} sha256:${sha}`)
  }
  writeFileSync(join(fixture, 'digests.txt'), digests.join('\n') + '\n')
  for (const a of ['arm64', 'x64']) for (const e of ['dmg', 'zip']) writeFileSync(join(bucket, `v${ver}`, `Agent-World-${ver}-${a}.${e}`), 'mac')
  writeFileSync(join(bucket, `v${ver}`, 'latest-mac.yml'), 'yml')
  const run = (tag: string, phase: string, extra: Record<string, string> = {}) =>
    spawnSync('bash', [SCRIPT, tag], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE: fixture, FAKE_BUCKET: bucket, LOG: join(root, 'log'), PHASE: phase, ...extra } })
  const ls = (sub: string) => (existsSync(join(bucket, sub)) ? readdirSync(join(bucket, sub)).sort() : [])
  return { run, ls }
}

const linuxFiles = (ver: string) => ({ [`Agent-World-${ver}-amd64.deb`]: 'deb bytes', [`Agent-World-${ver}-x86_64.AppImage`]: 'appimage bytes' })

describe('mirroring the Linux installers to R2', () => {
  it('copies the deb and the AppImage of a published release to its version folder, and nothing else', () => {
    const { run, ls } = setup('1.2.3', { ...linuxFiles('1.2.3'), 'Agent-World-1.2.3-arm64.dmg': 'mac' })
    const r = run('v1.2.3', 'linux')
    expect(r.status, r.stderr).toBe(0)
    expect(ls('v1.2.3')).toEqual(expect.arrayContaining(['Agent-World-1.2.3-amd64.deb', 'Agent-World-1.2.3-x86_64.AppImage']))
    expect(ls('latest')).toEqual([])
  })

  it('refuses a file whose digest is not the one GitHub shows', () => {
    const { run, ls } = setup('1.2.3', linuxFiles('1.2.3'), ['Agent-World-1.2.3-amd64.deb'])
    const r = run('v1.2.3', 'linux')
    expect(r.status).not.toBe(0)
    expect(r.stdout + r.stderr).toContain('DIGEST MISMATCH Agent-World-1.2.3-amd64.deb')
    expect(ls('v1.2.3')).not.toContain('Agent-World-1.2.3-amd64.deb')
  })

  it('says so and succeeds for a release that has no Linux files, so an older release can still be mirrored', () => {
    const { run, ls } = setup('1.2.3', { 'Agent-World-1.2.3-arm64.dmg': 'mac' })
    const r = run('v1.2.3', 'linux')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('no Linux files')
    expect(ls('v1.2.3').some((f) => /deb|AppImage/.test(f))).toBe(false)
  })

  it('warns when the release holds only one of the two Linux files, and still mirrors what is there', () => {
    const { run, ls } = setup('1.2.3', { 'Agent-World-1.2.3-amd64.deb': 'deb bytes' })
    const r = run('v1.2.3', 'linux')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('WARNING: Agent-World-1.2.3-x86_64.AppImage is not on the release')
    expect(ls('v1.2.3')).toContain('Agent-World-1.2.3-amd64.deb')
  })

  it('stops when GitHub fails for any other reason, instead of reading it as a release without Linux files', () => {
    const { run, ls } = setup('1.2.3', linuxFiles('1.2.3'))
    const r = run('v1.2.3', 'linux', { GH_BROKEN: '1' })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('502')
    expect(ls('v1.2.3').some((f) => /deb|AppImage/.test(f))).toBe(false)
  })

  it('puts the newest stable at fixed addresses in latest/, beside the dmgs', () => {
    const { run, ls } = setup('1.2.3', linuxFiles('1.2.3'))
    expect(run('v1.2.3', 'linux').status).toBe(0)
    const r = run('v1.2.3', 'latest')
    expect(r.status, r.stderr).toBe(0)
    expect(ls('latest')).toEqual(expect.arrayContaining(['Agent-World-amd64.deb', 'Agent-World-x86_64.AppImage', 'Agent-World-arm64.dmg', 'Agent-World-x64.dmg']))
  })

  it('leaves latest/ alone for a beta', () => {
    const { run, ls } = setup('1.3.0-beta.1', linuxFiles('1.3.0-beta.1'))
    expect(run('v1.3.0-beta.1', 'linux').status).toBe(0)
    expect(ls('v1.3.0-beta.1')).toContain('Agent-World-1.3.0-beta.1-amd64.deb')
    expect(run('v1.3.0-beta.1', 'latest').status).toBe(0)
    expect(ls('latest')).toEqual([])
  })

  it('refreshes latest/ for a stable that has no Linux files without failing', () => {
    const { run, ls } = setup('1.2.3', {})
    const r = run('v1.2.3', 'latest')
    expect(r.status, r.stderr).toBe(0)
    expect(ls('latest')).not.toContain('Agent-World-amd64.deb')
    expect(ls('latest')).toContain('Agent-World-arm64.dmg')
  })
})
