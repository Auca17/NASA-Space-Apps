"""Genera el logo de Ashfield (propuesta A) en web/public/brand/.

Uso: python tools/brand/build_logo.py <dir>   (con <dir>/font/Archivo.ttf de Google Fonts, OFL;
escribe en <dir>/out/). Los PNG se exportan con rsvg-convert.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

D = Path(sys.argv[1]); OUT = D / "out"
EMBER, CROP, STUB, INK, LIGHT, BG, BGD = "#b3401e", "#5d8a4e", "#a8977a", "#1b1b18", "#eceae3", "#f7f5f0", "#141412"
EMBER_D, CROP_D, STUB_D = "#d4552d", "#6f9e5f", "#8f7f63"

def mark(ink, ember, crop, stub, small=False):
    sw = 4 if small else 2.6
    furrows = (f'<path d="M9 57 Q32 51 55 57" fill="none" stroke="{stub}" stroke-width="{sw}" stroke-linecap="round"/>' if small else
               f'<path d="M12 54 Q32 49 52 54" fill="none" stroke="{stub}" stroke-width="{sw}" stroke-linecap="round"/>'
               f'<path d="M7 60 Q32 54 57 60" fill="none" stroke="{stub}" stroke-width="{sw}" stroke-linecap="round"/>')
    return (f'<path d="M31 47 C17 43 12 27 21 9 C23 22 32 27 31 47 Z" fill="{ember}"/>'
            f'<path d="M33 47 C33 31 40 22 49 15 C53 31 46 44 33 47 Z" fill="{crop}"/>'
            f'<path d="M32 46 L32 {52 if small else 53}" stroke="{ink}" stroke-width="{sw}" stroke-linecap="round"/>' + furrows)

def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{rect}{body}</svg>\n'

font = instantiateVariableFont(TTFont(D / "font/Archivo.ttf"), {"wght": 800, "wdth": 100})
gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
def word(text, size, x0, base, colors):
    """text -> list of <path>; colors: per-char fill."""
    s = size / upm; track = -0.03 * upm; x = 0; out = []
    for ch, col in zip(text, colors):
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x0 + x * s, base)))
        out.append(f'<path d="{pen.getCommands()}" fill="{col}"/>')
        x += gs[g].width + track
    return "".join(out), x * s

for name, ink, em, cr, st in (("light", INK, EMBER, CROP, STUB), ("dark", LIGHT, EMBER_D, CROP_D, STUB_D)):
    (OUT / f"ashfield-mark-{name}.svg").write_text(svg(64, 64, mark(ink, em, cr, st)))
    (OUT / f"ashfield-favicon-{name}.svg").write_text(svg(64, 64, mark(ink, em, cr, st, small=True)))
    cols = [ink] * 3 + [em] * 5
    w, wd = word("Ashfield", 56, 84, 56, cols)
    W = int(84 + wd + 8)
    (OUT / f"ashfield-lockup-{name}.svg").write_text(svg(W, 72, f'<g transform="translate(0,2) scale(1.06)">{mark(ink, em, cr, st)}</g>' + w))
# portada 1200x630
w, wd = word("Ashfield", 120, 0, 0, [INK] * 3 + [EMBER] * 5)
sub, sw = word("Fire & field intelligence", 34, 0, 0, [ "#5b5b55"] * 25)
W = 1200; mx = 200 + 40
total = 200 + 40 + wd; x0 = (W - total) / 2
cover = (f'<g transform="translate({x0},215) scale(3.125)">{mark(INK, EMBER, CROP, STUB)}</g>'
         f'<g transform="translate({x0 + 240},360)">{w}</g><g transform="translate({x0 + 244},420)">{sub}</g>')
(OUT / "ashfield-cover.svg").write_text(svg(W, 630, cover, BG))
