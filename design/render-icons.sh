#!/bin/sh
# Renders icon PNGs from the SVGs with headless Chrome at 512px, then downsamples with sips.
set -e
cd "$(dirname "$0")/.."
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
render() { # svg out.png
  printf '<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:512px;height:512px}</style><img src="file://%s">' "$PWD/$1" > design/.render.html
  "$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --window-size=512,512 --screenshot="$2" "file://$PWD/design/.render.html" >/dev/null 2>&1
}
render public/icon.svg public/icon-512.png
render design/icon-full.svg design/.full-512.png
render public/favicon.svg design/.fav-512.png
sips -s format png -Z 192 public/icon-512.png --out public/icon-192.png >/dev/null
cp design/.full-512.png public/icon-maskable-512.png
sips -s format png -Z 180 design/.full-512.png --out public/apple-touch-icon.png >/dev/null
sips -s format png -Z 32 design/.fav-512.png --out public/favicon-32.png >/dev/null
sips -s format png -Z 16 design/.fav-512.png --out design/.fav-16.png >/dev/null
rm -f design/.render.html
