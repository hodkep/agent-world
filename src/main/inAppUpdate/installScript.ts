import { accessSync, constants } from 'node:fs'
import { dirname } from 'node:path'
/** The helper the app runs, detached, to replace itself: see the comment at its top. A fixed text; what it works on comes as arguments. */
export const INSTALL_SCRIPT = [
  "#!/bin/sh",
  "# Agent World's updater. It is told everything as arguments, and has nothing of anyone's in its own text:",
  "#   $1 the pid of the app to wait for      $2 the downloaded zip           $3 the app bundle to replace",
  "#   $4 the version the new one must be     $5 the bundle identifier it must have",
  "#   $6 a log file                          $7 a file to say how it ended (ok, or failed and why)",
  "# It needs no password and writes nothing outside the folder the app is in, the log and the result.",
  "PID=\"$1\"; ZIP=\"$2\"; APP=\"$3\"; WANT_VERSION=\"$4\"; WANT_ID=\"$5\"; LOG=\"$6\"; RESULT=\"$7\"",
  "DITTO=\"${AW_DITTO:-/usr/bin/ditto}\"",
  "CODESIGN=\"${AW_CODESIGN:-/usr/bin/codesign}\"",
  "OPEN=\"${AW_OPEN:-/usr/bin/open}\"",
  "PLIST=\"${AW_PLISTBUDDY:-/usr/libexec/PlistBuddy}\"",
  "MV=\"${AW_MV:-/bin/mv}\"",
  "TMP=\"\"",
  "BACKUP=\"\"",
  "",
  "log() { printf '%s %s\\n' \"$(/bin/date '+%Y-%m-%d %H:%M:%S')\" \"$1\" >>\"$LOG\" 2>/dev/null; }",
  "",
  "# Whatever went wrong: the old version goes back if it was moved aside, what was made is removed, the old app is opened, and the reason is kept.",
  "fail() {",
  "  log \"failed: $1\"",
  "  if [ -n \"$BACKUP\" ] && [ -e \"$BACKUP\" ] && [ ! -e \"$APP\" ]; then \"$MV\" \"$BACKUP\" \"$APP\" || log \"could not put the old version back from $BACKUP\"; fi",
  "  if [ -n \"$TMP\" ]; then /bin/rm -rf \"$TMP\"; fi",
  "  printf 'failed: %s\\n' \"$1\" >\"$RESULT\" 2>/dev/null",
  "  if [ -d \"$APP\" ]; then \"$OPEN\" \"$APP\" >/dev/null 2>&1; fi",
  "  exit 1",
  "}",
  "",
  "case \"$APP\" in",
  "  /*.app) ;;",
  "  *) log \"failed: $APP is not an app bundle path\"; printf 'failed: not an app bundle path\\n' >\"$RESULT\" 2>/dev/null; exit 1 ;;",
  "esac",
  "[ -d \"$APP\" ] || fail \"the app to replace is not there\"",
  "[ -f \"$ZIP\" ] || fail \"the downloaded file is not there\"",
  "",
  "# Wait for the app to quit (up to thirty seconds): nothing is touched while it runs.",
  "N=0",
  "while /bin/kill -0 \"$PID\" 2>/dev/null; do",
  "  N=$((N + 1))",
  "  [ \"$N\" -gt 150 ] && fail \"the app did not quit\"",
  "  /bin/sleep 0.2",
  "done",
  "",
  "# Unpacked next to the app, on the same volume, so the last move is one rename.",
  "PARENT=$(/usr/bin/dirname \"$APP\")",
  "TMP=$(/usr/bin/mktemp -d \"$PARENT/.agent-world-update.XXXXXX\") || fail \"could not make a folder next to the app\"",
  "\"$DITTO\" -x -k \"$ZIP\" \"$TMP\" 2>>\"$LOG\" || fail \"the download could not be unpacked\"",
  "set -- \"$TMP\"/*.app",
  "[ \"$#\" -eq 1 ] && [ -d \"$1\" ] || fail \"the download does not hold exactly one app\"",
  "NEW=\"$1\"",
  "",
  "# What was unpacked must be Agent World, at the version that was announced, with a signature that holds together.",
  "GOT_ID=$(\"$PLIST\" -c 'Print :CFBundleIdentifier' \"$NEW/Contents/Info.plist\" 2>/dev/null)",
  "[ \"$GOT_ID\" = \"$WANT_ID\" ] || fail \"its identity is not Agent World's (bundle identifier $GOT_ID)\"",
  "GOT_VERSION=$(\"$PLIST\" -c 'Print :CFBundleShortVersionString' \"$NEW/Contents/Info.plist\" 2>/dev/null)",
  "[ \"$GOT_VERSION\" = \"$WANT_VERSION\" ] || fail \"its version is $GOT_VERSION, not the announced $WANT_VERSION\"",
  "\"$CODESIGN\" --verify --deep --strict \"$NEW\" 2>>\"$LOG\" || fail \"its signature does not verify\"",
  "",
  "# The old one is moved aside and the new one moved in: two renames on one volume.",
  "BACKUP=\"$PARENT/.agent-world-backup.$$\"",
  "\"$MV\" \"$APP\" \"$BACKUP\" || fail \"the old version could not be moved aside\"",
  "\"$MV\" \"$NEW\" \"$APP\" || fail \"the new version could not be put in place\"",
  "",
  "/bin/rm -rf \"$BACKUP\" \"$TMP\"",
  "printf 'ok %s\\n' \"$WANT_VERSION\" >\"$RESULT\" 2>/dev/null",
  "log \"installed $WANT_VERSION\"",
  "\"$OPEN\" \"$APP\" >/dev/null 2>&1",
  "exit 0"
].join('\n') + '\n'

/**
 * Why the app must not try to replace itself where it is, or null when it may. Nothing is attempted in a place macOS runs read-only (the disk image, or a
 * copy it moved for a first open), on a read-only volume, or in a folder this person cannot write to: there the download is kept and the release page is
 * offered, as before.
 */
export function installBlocker(o: { appPath: string; parentWritable: boolean; readOnlyVolume: boolean }): string | null {
  if (!/^\/.*\.app$/.test(o.appPath)) return 'Agent World cannot tell where it is installed.'
  if (o.appPath.includes('/AppTranslocation/')) return 'macOS is running Agent World from a temporary read-only place (the disk image, or Downloads after a first open). Drag Agent World to Applications, open it from there, and update again.'
  if (o.readOnlyVolume) return 'Agent World is on a read-only disk, so it cannot replace itself. Drag it to Applications, open it from there, and update again.'
  if (!o.parentWritable) return `Agent World cannot change the folder it is in (${dirname(o.appPath)} is not writable for this user). The new version is saved; open it from Finder and drag it to Applications yourself.`
  return null
}

/** Looks at the folder the app is in: whether this user may add and remove things there, and whether the volume is read-only. */
export function placeOf(appPath: string): { parentWritable: boolean; readOnlyVolume: boolean } {
  try {
    accessSync(dirname(appPath), constants.W_OK)
    return { parentWritable: true, readOnlyVolume: false }
  } catch (e) {
    return { parentWritable: false, readOnlyVolume: (e as NodeJS.ErrnoException).code === 'EROFS' }
  }
}
