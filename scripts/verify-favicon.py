#!/usr/bin/env python3
"""Verify favicon assets satisfy Next.js/Turbopack's strict image decoder.

Turbopack (Rust `image` crate) fails the build with:
  "Format error decoding Ico: The PNG is not in RGBA format!"
unless EVERY PNG entry inside favicon.ico is color-type 6 (RGBA).
This checks that, frame modes, and apple-icon.png mode.
"""
import os
import struct
import sys

from PIL import Image

ROOT = '/home/z/my-project'
FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(('  \u2713 ' if cond else '  \u2717 ') + msg)
    if not cond:
        FAILURES.append(msg)


# ---- favicon.ico -----------------------------------------------------
path = os.path.join(ROOT, 'src/app/favicon.ico')
data = open(path, 'rb').read()
print(f'favicon.ico  ({os.path.getsize(path)} bytes)')

check(data[:4] == b'\x00\x00\x01\x00', 'ICO magic (icon dir, type=1)')
count = struct.unpack('<H', data[4:6])[0]
check(count >= 1, f'{count} entries')

off = 6
for i in range(count):
    w, h, _, _, planes, bpp, size, ofs = struct.unpack('<BBBBHHII', data[off:off + 16])
    off += 16
    blob = data[ofs:ofs + size]
    if blob[:8] == b'\x89PNG\r\n\x1a\n':
        wpx, hpx = struct.unpack('>II', blob[16:24])
        depth, ctype = blob[24], blob[25]
        names = {0: 'gray', 2: 'RGB', 3: 'palette', 4: 'gray+A', 6: 'RGBA'}
        check(ctype == 6,
              f'entry {i}: PNG {wpx}x{hpx} depth={depth} '
              f'colortype={ctype} ({names.get(ctype)}) -> must be 6/RGBA')
    else:
        # BMP/DIB entry: image-rs only accepts 32-bit RGBA here
        check(bpp == 32, f'entry {i}: BMP/DIB bpp={bpp} -> must be 32 (RGBA)')

# PIL round-trip: every frame must decode as RGBA
im = Image.open(path)
idx, modes = 0, []
while True:
    try:
        im.seek(idx)
    except EOFError:
        break
    modes.append(f'{im.size[0]}x{im.size[1]}:{im.copy().mode}')
    idx += 1
check(all(m.split(':')[-1] == 'RGBA' for m in modes),
      f'PIL frames all RGBA -> {", ".join(modes)}')

# ---- apple-icon.png / any other raster metadata icons -----------------
for rel in ('src/app/apple-icon.png',):
    p = os.path.join(ROOT, rel)
    im = Image.open(p)
    check(im.format == 'PNG' and im.mode == 'RGBA',
          f'{rel}: {im.format} {im.mode} {im.size[0]}x{im.size[1]} -> must be PNG RGBA')

print()
if FAILURES:
    print('FAILED:', len(FAILURES))
    sys.exit(1)
print('ALL CHECKS PASSED \u2014 ICO/PNGs are RGBA, Turbopack-safe')
