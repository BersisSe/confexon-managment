#!/bin/sh
# Renders the 3 teaser stories (1080x1920) and a animated video.
set -e
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for n in 1 2 3; do
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1920 --virtual-time-budget=8000 \
    --screenshot="$(cygpath -w "$PWD/story-$n.png")" \
    "file:///$(cygpath -m "$PWD/story.html")?f=$n"
done

python animate.py
# Link preview image for the coming-soon page.
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --virtual-time-budget=8000 \
  --screenshot="$(cygpath -w "$PWD/site/og.png")" "file:///$(cygpath -m "$PWD/og.html")"
