#!/bin/bash
# Copies a published GitHub release's installers to the R2 mirror and drops the older folders of the same kind. It needs no Mac: it only moves files.
#   scripts/mirror-release.sh v0.8.0            takes the files from the release on GitHub (checked against the digests GitHub shows)
#   scripts/mirror-release.sh v0.8.0 <dir>      takes them from a folder that holds the build, for a release that is not published yet
# The remote `r2` is the one in rclone.conf on a Mac; in CI it is made from RCLONE_CONFIG_R2_* variables. DRYRUN=1 shows what would move and changes nothing.
# Folder per version: v<version>/ holds the dmgs, the zips and latest-mac.yml. The newest stable and the newest beta are kept; the checksums that decide
# whether a download is good still come from the GitHub release, so the mirror is only a faster copy.
set -euo pipefail
TAG="${1:?tag, e.g. v0.8.0}"; DIR="${2:-}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]] || { echo "not a release tag: $TAG"; exit 1; }
VER="${TAG#v}"; REPO="${REPO:-hodkep/agent-world}"
BUCKET="r2:agent-world-releases"; BASE="https://pub-761b6780fbbc4b30b60a22f902c0e743.r2.dev"
FLAGS=(--s3-no-check-bucket); [ -n "${DRYRUN:-}" ] && FLAGS+=(--dry-run)

if [ -z "$DIR" ]; then
  DIR="$(mktemp -d)"; trap 'rm -rf "$DIR"' EXIT
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

# Older folders of the same kind go (a beta has a dash in its version). A newer one, or one of the other kind, stays, so mirroring an old release changes nothing else.
kind() { case "$1" in *-*) echo beta;; *) echo stable;; esac; }
for d in $(rclone lsf "$BUCKET" --dirs-only | sed 's#/$##'); do
  v="${d#v}"; [ "$v" = "$VER" ] && continue; [ "$(kind "$v")" = "$(kind "$VER")" ] || continue
  [ "$(printf '%s\n%s\n' "${v%%-*}" "${VER%%-*}" | sort -V | head -1)" = "${v%%-*}" ] || continue
  echo "removing old mirror folder $d"; rclone purge "$BUCKET/$d" "${FLAGS[@]}"
done
# The newest stable's dmgs also sit at fixed addresses (latest/Agent-World-arm64.dmg, latest/Agent-World-x64.dmg) that the README, the install page and the site link to.
if [ "$(kind "$VER")" = stable ]; then
  for a in arm64 x64; do rclone copyto "$BUCKET/v$VER/Agent-World-$VER-$a.dmg" "$BUCKET/latest/Agent-World-$a.dmg" "${FLAGS[@]}"; done
fi
echo "MIRROR-DONE $BASE/v$VER/Agent-World-$VER-arm64.dmg"
