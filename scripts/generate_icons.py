"""Generate Podcastdilemma app-icons in PNG en SVG.

Tekent een afgeronde rode tegel met daarop een gestileerde koptelefoon
(headband + twee oorschelpen). Schaalt naar de gevraagde groottes en
schrijft alles in web/icons/. Hardrun:

    python scripts/generate_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "icons"

ACCENT = "#b9302a"
WHITE = "#ffffff"


def draw_icon(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Render één icon op `size` × `size` pixels."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Achtergrond: afgeronde rode tegel.
    r = int(size * radius_ratio)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=ACCENT)

    # Geometrie van de koptelefoon — alle waarden relatief aan `size`.
    cx = size / 2
    band_top = size * 0.30
    band_bottom = size * 0.62
    band_left = size * 0.22
    band_right = size * 0.78
    band_width = max(int(size * 0.07), 2)

    # Headband: bovenste helft van een ellips ("U" omgekeerd).
    d.arc(
        (band_left, band_top, band_right, band_bottom + (band_bottom - band_top)),
        start=180,
        end=360,
        fill=WHITE,
        width=band_width,
    )

    # Oorschelpen: twee afgeronde rechthoeken aan de uiteinden.
    cup_w = size * 0.20
    cup_h = size * 0.26
    cup_y_top = size * 0.50
    cup_y_bot = cup_y_top + cup_h
    cup_r = int(cup_w * 0.40)

    # Linkerschelp
    d.rounded_rectangle(
        (band_left - cup_w / 2, cup_y_top, band_left + cup_w / 2, cup_y_bot),
        radius=cup_r,
        fill=WHITE,
    )
    # Rechterschelp
    d.rounded_rectangle(
        (band_right - cup_w / 2, cup_y_top, band_right + cup_w / 2, cup_y_bot),
        radius=cup_r,
        fill=WHITE,
    )

    return img


def write_svg(path: Path) -> None:
    """Vector-versie van dezelfde tekening, voor manifest + favicon."""
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="113" ry="113" fill="#b9302a"/>
  <path d="M 113 282 A 143 143 0 0 1 399 282"
        stroke="#ffffff" stroke-width="36" fill="none" stroke-linecap="round"/>
  <rect x="61" y="256" width="102" height="134" rx="41" fill="#ffffff"/>
  <rect x="349" y="256" width="102" height="134" rx="41" fill="#ffffff"/>
</svg>
"""
    path.write_text(svg, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
    }
    for name, size in targets.items():
        draw_icon(size).save(OUT / name, optimize=True)
        print(f"  {name}: {size}×{size}")
    write_svg(OUT / "icon.svg")
    print(f"  icon.svg (vector)")


if __name__ == "__main__":
    main()
