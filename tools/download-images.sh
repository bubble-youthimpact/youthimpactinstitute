#!/bin/sh
# Downloads every image listed in tools/image-manifest.tsv into content/images/.
# Run from the project folder:  sh tools/download-images.sh
cd "$(dirname "$0")/.." || exit 1
ok=0; fail=0
while IFS="$(printf '\t')" read -r url path; do
  [ -z "$url" ] && continue
  dest="content/images/$path"
  [ -s "$dest" ] && { ok=$((ok+1)); continue; }
  mkdir -p "$(dirname "$dest")"
  if curl -fsSL --retry 2 -o "$dest" "$url"; then ok=$((ok+1)); else fail=$((fail+1)); rm -f "$dest"; echo "failed: $url"; fi
done < tools/image-manifest.tsv
echo "done: $ok saved, $fail failed"
