# Generates the PWA icons in public/icons (npm run icons). Needs Pillow: pip install pillow.
# One geometry on a 100x100 grid, written as SVG and rasterised with 4x supersampling.
import os, sys
from PIL import Image, ImageDraw

NAVY, TEAL, WHITE, LINE = "#1F3A5F", "#0E7C86", "#FFFFFF", "#B9C9DC"
SS = 4  # supersampling factor

# (kind, params...) in 100-unit coordinates
DOC = (28, 16, 72, 84, 6)                               # x0, y0, x1, y1, radius
LINES = [(36, 28, 64), (36, 38, 64), (36, 48, 56)]      # x0, y, x1 (4 units thick)
BADGE = (68, 70, 17)                                    # cx, cy, r (ring of 3 in navy)
CHECK = [(60, 70.5), (65.5, 76), (76, 64.5)]            # stroke 5, round caps


def svg(rounded: bool) -> str:
    bg = f'<rect width="100" height="100" rx="{22 if rounded else 0}" fill="{NAVY}"/>'
    x0, y0, x1, y1, r = DOC
    lines = "".join(f'<rect x="{a}" y="{y - 2}" width="{b - a}" height="4" rx="2" fill="{LINE}"/>' for a, y, b in LINES)
    cx, cy, br = BADGE
    pts = " ".join(f"{x},{y}" for x, y in CHECK)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f"{bg}"
        f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="{WHITE}"/>{lines}'
        f'<circle cx="{cx}" cy="{cy}" r="{br}" fill="{TEAL}" stroke="{NAVY}" stroke-width="3"/>'
        f'<polyline points="{pts}" fill="none" stroke="{WHITE}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
        "</svg>\n"
    )


def png(size: int, *, rounded: bool, content_scale: float = 1.0) -> Image.Image:
    px = size * SS
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = px / 100
    # content_scale < 1 shrinks the artwork into the maskable safe zone, keeping the background full-bleed
    t = lambda v: (50 + (v - 50) * content_scale) * u
    s = lambda v: v * content_scale * u

    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=22 * u if rounded else 0, fill=NAVY)
    x0, y0, x1, y1, r = DOC
    d.rounded_rectangle([t(x0), t(y0), t(x1), t(y1)], radius=s(r), fill=WHITE)
    for a, y, b in LINES:
        d.rounded_rectangle([t(a), t(y - 2), t(b), t(y + 2)], radius=s(2), fill=LINE)
    cx, cy, br = BADGE
    d.ellipse([t(cx - br - 1.5), t(cy - br - 1.5), t(cx + br + 1.5), t(cy + br + 1.5)], fill=NAVY)
    d.ellipse([t(cx - br + 1.5), t(cy - br + 1.5), t(cx + br - 1.5), t(cy + br - 1.5)], fill=TEAL)
    pts = [(t(x), t(y)) for x, y in CHECK]
    w = s(5)
    d.line(pts, fill=WHITE, width=round(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


def main(out: str) -> None:
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "favicon.svg"), "w") as f:
        f.write(svg(rounded=True))
    png(64, rounded=True).save(os.path.join(out, "favicon-64.png"), optimize=True)
    png(192, rounded=True).save(os.path.join(out, "icon-192.png"), optimize=True)
    png(512, rounded=True).save(os.path.join(out, "icon-512.png"), optimize=True)
    # iOS applies its own mask and shows transparency as black: full-bleed, opaque.
    png(180, rounded=False).convert("RGB").save(os.path.join(out, "apple-touch-icon.png"), optimize=True)
    # Maskable: the safe zone is the central 80% circle.
    png(512, rounded=False, content_scale=0.78).save(os.path.join(out, "maskable-512.png"), optimize=True)
    print(f"icons written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public/icons")
