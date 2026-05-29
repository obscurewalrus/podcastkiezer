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

    # Oorschelpen — eerst posities bepalen want de boog moet daar
    # precies in eindigen (niet erop, anders ziet 'ie er onnatuurlijk uit).
    band_x_left = size * 0.22   # centrum van de linker schelp
    band_x_right = size * 0.78
    cup_w = size * 0.22
    cup_h = size * 0.30
    cup_y_top = size * 0.46
    cup_y_bot = cup_y_top + cup_h
    cup_r = int(cup_w * 0.42)

    # Headband: bovenste helft van een ellips. Booguiteinden liggen
    # iets ínside de schelp (6% van de icon-hoogte onder cup_y_top),
    # zodat ze, nadat de schelp er bovenop wordt getekend, eronder
    # 'verdwijnen' — net als bij een echte koptelefoon.
    band_apex_y = size * 0.18
    band_end_y = cup_y_top + size * 0.06
    band_y_bottom = 2 * band_end_y - band_apex_y
    band_width = max(int(size * 0.085), 2)
    d.arc(
        (band_x_left, band_apex_y, band_x_right, band_y_bottom),
        start=180,
        end=360,
        fill=WHITE,
        width=band_width,
    )

    # Schelpen tekenen ná de boog zodat ze er bovenop liggen
    # (verhindert dat de boog-randen door de schelp heen prikken).
    d.rounded_rectangle(
        (band_x_left - cup_w / 2, cup_y_top, band_x_left + cup_w / 2, cup_y_bot),
        radius=cup_r,
        fill=WHITE,
    )
    d.rounded_rectangle(
        (band_x_right - cup_w / 2, cup_y_top, band_x_right + cup_w / 2, cup_y_bot),
        radius=cup_r,
        fill=WHITE,
    )

    return img


def write_svg(path: Path) -> None:
    """Vector-versie van dezelfde tekening (verhoudingen identiek aan
    de raster-versie zodat manifest-icoon en favicon overeenkomen)."""
    # Coordinates op 512×512 viewBox, dezelfde ratios als draw_icon().
    # Boog: van (113, 266) naar (399, 266), apex bij y ≈ 92. De schelpen
    # worden ná de boog getekend zodat de boog-uiteinden 'verdwijnen'
    # in de schelp — net zoals bij een echte koptelefoon.
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="113" ry="113" fill="#b9302a"/>
  <path d="M 113 266 A 143 174 0 0 1 399 266"
        stroke="#ffffff" stroke-width="44" fill="none" stroke-linecap="round"/>
  <rect x="56" y="236" width="113" height="154" rx="47" fill="#ffffff"/>
  <rect x="343" y="236" width="113" height="154" rx="47" fill="#ffffff"/>
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
