#!/bin/bash
# Copies a published GitHub release's installers to the R2 mirror and drops the older folders of the same kind. It needs no Mac: it only moves files.
#   scripts/mirror-release.sh v0.8.0            takes the files from the release on GitHub (checked against the digests GitHub shows)
#   scripts/mirror-release.sh v0.8.0 <dir>      takes them from a folder that holds the build, for a release that is not published yet
# PHASE=upload copies only v<version>/ (no GitHub release needed, so it can run while the build is drafted and main CI runs); PHASE=latest then prunes old folders and refreshes latest/ (run it after the release is published). PHASE=linux copies the Linux deb and AppImage that CI attached to the release (it needs the release published, as a draft cannot be downloaded by tag; run it before PHASE=latest). Default: upload, linux, latest.
# The remote `r2` is the one in rclone.conf on a Mac (on a runner it can be made from RCLONE_CONFIG_R2_* variables). DRYRUN=1 shows what would move and changes nothing.
# Folder per version: v<version>/ holds the dmgs, the zips and latest-mac.yml. The newest stable and the newest beta are kept; the checksums that decide
# whether a download is good still come from the GitHub release, so the mirror is only a faster copy.
set -euo pipefail
TAG="${1:?tag, e.g. v0.8.0}"; DIR="${2:-}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || { echo "not a release tag: $TAG"; exit 1; }
VER="${TAG#v}"; REPO="${REPO:-hodkep/agent-world}"
BUCKET="r2:agent-world-releases"; BASE="https://dl.agent-world.in"
PHASE="${PHASE:-all}"; [[ "$PHASE" =~ ^(all|upload|linux|latest)$ ]] || { echo "PHASE is all, upload, linux or latest"; exit 1; }
FLAGS=(--s3-no-check-bucket); [ -n "${DRYRUN:-}" ] && FLAGS+=(--dry-run)
TMPS=""; trap 'for d in $TMPS; do rm -rf "$d"; done' EXIT # every temp folder below, whichever phases run

if [ "$PHASE" = all ] || [ "$PHASE" = upload ]; then
if [ -z "$DIR" ]; then
  DIR="$(mktemp -d)"; TMPS="$TMPS $DIR"
  gh release download "$TAG" --repo "$REPO" --dir "$DIR" --pattern "Agent-World-$VER-*.dmg" --pattern "Agent-World-$VER-*.zip" --pattern latest-mac.yml
  # GitHub shows each asset's sha256; a file that differs is not copied.
  gh api "repos/$REPO/releases/tags/$TAG" --jq '.assets[] | "\(.name) \(.digest)"' | while read -r name digest; do
    [ -f "$DIR/$name" ] || continue
    [ "$(shasum -a 256 "$DIR/$name" | cut -d' ' -f1)" = "${digest#sha256:}" ] || { echo "DIGEST MISMATCH $name"; exit 1; }
  done
fi
for a in arm64 x64; do for e in dmg zip; do [ -f "$DIR/Agent-World-$VER-$a.$e" ] || { echo "missing Agent-World-$VER-$a.$e"; exit 1; }; done; done

rclone copy "$DIR" "$BUCKET/v$VER" --include "Agent-World-$VER-*.dmg" --include "Agent-World-$VER-*.zip" --include latest-mac.yml "${FLAGS[@]}" --progress=false
if [ -z "${DRYRUN:-}" ]; then
  for f in "$DIR"/Agent-World-"$VER"-*.dmg "$DIR"/Agent-World-"$VER"-*.zip; do
    want=$(wc -c < "$f" | tr -d ' '); got=$(rclone size --json "$BUCKET/v$VER/$(basename "$f")" | sed -E 's/.*"bytes":([0-9]+).*/\1/')
    [ "$want" = "$got" ] || { echo "SIZE MISMATCH $(basename "$f"): release $want, mirror $got"; exit 1; }
  done
fi

# Same bytes as the local files, checked by hash from the mirror's own metadata: nothing is downloaded back.
[ -z "${DRYRUN:-}" ] && rclone check "$DIR" "$BUCKET/v$VER" --one-way --include "Agent-World-$VER-*.dmg" --include "Agent-World-$VER-*.zip" --include latest-mac.yml --s3-no-check-bucket
fi

# The Linux installers come from CI, attached to the release after the Mac build, so they are taken from the published release (a build folder is the Mac files only).
LINUX=("Agent-World-$VER-amd64.deb" "Agent-World-$VER-x86_64.AppImage")
if [ "$PHASE" = linux ] || { [ "$PHASE" = all ] && [ -z "$DIR" ]; }; then
  LDIR="$(mktemp -d)"; TMPS="$TMPS $LDIR"
  # Only "no file matches" means the release has no Linux files; any other failure (network, no such release) stops here instead of being read as none.
  if gh release download "$TAG" --repo "$REPO" --dir "$LDIR" --pattern "${LINUX[0]}" --pattern "${LINUX[1]}" 2>"$LDIR/.err" || { grep -q "no assets match" "$LDIR/.err" || { cat "$LDIR/.err" >&2; exit 1; }; false; }; then
    gh api "repos/$REPO/releases/tags/$TAG" --jq '.assets[] | "\(.name) \(.digest)"' | while read -r name digest; do
      [ -f "$LDIR/$name" ] || continue
      [ "$(shasum -a 256 "$LDIR/$name" | cut -d' ' -f1)" = "${digest#sha256:}" ] || { echo "DIGEST MISMATCH $name"; exit 1; }
    done
    rclone copy "$LDIR" "$BUCKET/v$VER" --include "${LINUX[0]}" --include "${LINUX[1]}" "${FLAGS[@]}" --progress=false
    if [ -z "${DRYRUN:-}" ]; then
      for f in "$LDIR"/*; do
        want=$(wc -c < "$f" | tr -d ' '); got=$(rclone size --json "$BUCKET/v$VER/$(basename "$f")" | sed -E 's/.*"bytes":([0-9]+).*/\1/')
        [ "$want" = "$got" ] || { echo "SIZE MISMATCH $(basename "$f"): release $want, mirror $got"; exit 1; }
      done
    fi
    for f in "${LINUX[@]}"; do [ -f "$LDIR/$f" ] || echo "WARNING: $f is not on the release"; done # CI may have attached only one
    echo "MIRRORED Linux: $(ls "$LDIR" | tr '\n' ' ')"
  else
    echo "no Linux files on $TAG, nothing to mirror"
  fi
fi

if [ "$PHASE" = all ] || [ "$PHASE" = latest ]; then
# Older folders of the same kind go (a beta has a dash in its version). A newer one, or one of the other kind, stays, so mirroring an old release changes nothing else.
kind() { case "$1" in *-*) echo beta;; *) echo stable;; esac; }
for d in $(rclone lsf "$BUCKET" --dirs-only | sed 's#/$##'); do
  [[ "$d" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || continue # only version folders: latest/ and anything else is left alone
  v="${d#v}"; [ "$v" = "$VER" ] && continue; [ "$(kind "$v")" = "$(kind "$VER")" ] || continue
  [ "$(printf '%s\n%s\n' "${v%%-*}" "${VER%%-*}" | sort -V | head -1)" = "${v%%-*}" ] || continue
  echo "removing old mirror folder $d"; rclone purge "$BUCKET/$d" "${FLAGS[@]}"
done
# The newest stable's dmgs also sit at fixed addresses (latest/Agent-World-arm64.dmg, latest/Agent-World-x64.dmg, and latest/latest-mac.yml for the update check) that the README, the install page and the site link to.
if [ "$(kind "$VER")" = stable ]; then
  for a in arm64 x64; do rclone copyto "$BUCKET/v$VER/Agent-World-$VER-$a.dmg" "$BUCKET/latest/Agent-World-$a.dmg" "${FLAGS[@]}"; done
  # And its latest-mac.yml, at a fixed address too: an app that GitHub will not answer (its unauthenticated limit is spent) reads the newest version from it.
  rclone copyto "$BUCKET/v$VER/latest-mac.yml" "$BUCKET/latest/latest-mac.yml" "${FLAGS[@]}"
  # The Linux deb and AppImage too, when this release has them (older ones do not): latest/Agent-World-amd64.deb and latest/Agent-World-x86_64.AppImage.
  for f in "${LINUX[@]}"; do
    [ -n "$(rclone lsf "$BUCKET/v$VER/$f")" ] || continue
    rclone copyto "$BUCKET/v$VER/$f" "$BUCKET/latest/${f/-$VER-/-}" "${FLAGS[@]}"
  done
fi
fi
echo "MIRROR-DONE $BASE/v$VER/Agent-World-$VER-arm64.dmg"
