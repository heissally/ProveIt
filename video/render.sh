#!/bin/sh
# Render the ProveIt launch video.
#
#   sh video/render.sh draft     silent, low resolution, fast: for checking timing and pictures
#   sh video/render.sh final     ElevenLabs narrator, full resolution, both shapes
#                                (re-uses saved narration in video/voice-cache, so no extra credits)
#
# Finished videos land in video/out/. Everything this needs lives inside video/.
set -e
cd "$(dirname "$0")"
MODE="${1:-draft}"
export PATH="$PWD/.tools/env/bin:$PATH"
export PYTHONPATH="$PWD"
export MPLCONFIGDIR="$PWD/.tools/cache/matplotlib"
mkdir -p out

if [ "$MODE" = "final" ]; then
  export PROVEIT_VOICE=elevenlabs
  unset PROVEIT_PREVIEW
else
  export PROVEIT_VOICE=draft
  export PROVEIT_PREVIEW=1
fi

for SHAPE in wide square; do
  export PROVEIT_SHAPE="$SHAPE"
  manim render --media_dir "media/$SHAPE" -o "proveit-$SHAPE-$MODE" --progress_bar none \
    proveit_launch.py ProveItLaunch
  cp "$(find "media/$SHAPE/videos" -name "proveit-$SHAPE-$MODE.mp4" -exec ls -t {} + | head -1)" \
    "out/proveit-$SHAPE-$MODE.mp4"
  if [ "$MODE" = "final" ]; then
    # Even out the narration to the usual loudness for social video (about -16 LUFS).
    ffmpeg -v error -y -i "out/proveit-$SHAPE-final.mp4" -c:v copy \
      -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
      "out/proveit-$SHAPE.mp4"
    rm "out/proveit-$SHAPE-final.mp4"
    echo "Done: video/out/proveit-$SHAPE.mp4"
  else
    echo "Done: video/out/proveit-$SHAPE-$MODE.mp4"
  fi
done
