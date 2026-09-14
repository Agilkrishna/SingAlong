#!/usr/bin/env python3
"""Generate DesiHangout red favicon assets: favicon.ico (16/32/48) + apple-icon.png (180).

Draws the same red-gradient mic as src/app/icon.svg with PIL.
"""
from PIL import Image, ImageDraw

RED_TOP = (246, 18, 29)    # F6121D
RED_BOTTOM = (158, 5, 14)  # 9E050E
WHITE = (255, 255, 255)
SIZE = 720  # master canvas (supersample), downscaled for crispness


def gradient_bg(size: int) -> Image.Image:
    img = Image.new('RGB', (size, size), RED_TOP)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        r = round(RED_TOP[0] + (RED_BOTTOM[0] - RED_TOP[0]) * t)
        g = round(RED_TOP[1] + (RED_BOTTOM[1] - RED_TOP[1]) * t)
        b = round(RED_TOP[2] + (RED_BOTTOM[2] - RED_TOP[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img


def draw_icon(img: Image.Image) -> Image.Image:
    s = img.size[0]
    u = s / 64  # 1 unit of the 64-unit viewBox
    d = ImageDraw.Draw(img)

    def ry(cx, cy, w, h, r, fill):
        """rounded (vertical) capsule/rect via rounded_rectangle"""
        x0, y0 = cx - w / 2, cy - h / 2
        x1, y1 = cx + w / 2, cy + h / 2
        d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=fill)

    # mic capsule (cx=32, cy=21.5, w=13, h=25, r=6.5)
    ry(32 * u, 21.5 * u, 13 * u, 25 * u, 6.5 * u, WHITE)

    # U holder: arc center (32, 28) r=15, bottom half (0°..180° in PIL = 3→9 o'clock clockwise through 6)
    bw = 5 * u  # stroke width
    bbox = [(32 - 15) * u, (28 - 15) * u, (32 + 15) * u, (28 + 15) * u]
    d.arc(bbox, start=0, end=180, fill=WHITE, width=round(bw))

    # stem: vertical line x=32 from y=43 to y=51
    d.line([(32 * u, 43 * u), (32 * u, 51 * u)], fill=WHITE, width=round(bw))
    # base: horizontal line y=53.5 from x=21.5 to 42.5
    d.line([(21.5 * u, 53.5 * u), (42.5 * u, 53.5 * u)], fill=WHITE, width=round(bw))
    # round line caps
    cap = bw / 2
    for (cx, cy) in [(32 * u, 51 * u), (21.5 * u, 53.5 * u), (42.5 * u, 53.5 * u), (32 * u, 43 * u)]:
        d.ellipse([cx - cap, cy - cap, cx + cap, cy + cap], fill=WHITE)
    return img


def main() -> None:
    # RGBA everywhere: Next.js/Turbopack's ICO decoder rejects non-RGBA PNGs
    # inside .ico ("The PNG is not in RGBA format!") and apple-icon.png is
    # image-processed at build time too. alpha=255 (opaque) keeps colors intact.
    master = draw_icon(gradient_bg(SIZE)).convert('RGBA')
    master.putalpha(255)

    # apple icon: full-bleed square, iOS applies its own mask
    apple = master.resize((180, 180), Image.LANCZOS)
    apple.save('/home/z/my-project/src/app/apple-icon.png', 'PNG')

    # favicon.ico with multiple sizes
    master.resize((256, 256), Image.LANCZOS).save(
        '/home/z/my-project/src/app/favicon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print('wrote src/app/apple-icon.png + src/app/favicon.ico')


if __name__ == '__main__':
    main()
