"""Generate deterministic transparent placeholder pet PNGs."""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "apps/desktop/resources/pet"
OUT.mkdir(parents=True, exist_ok=True)
YELLOW = "#d7ef78"
GREEN = "#173f35"
CREAM = "#f8f6ec"
RACKET = "#b98445"


def base(state: str) -> None:
    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    body_box = (136, 132, 376, 410)
    draw.ellipse(body_box, fill=YELLOW, outline=GREEN, width=10)
    draw.arc((150, 180, 214, 388), 110, 250, fill="#bfd95c", width=7)
    draw.arc((294, 170, 358, 380), 290, 70, fill="#bfd95c", width=7)
    draw.arc((190, 98, 322, 200), 190, 350, fill=GREEN, width=18)
    draw.ellipse((208, 242, 230, 270), fill=GREEN)
    draw.ellipse((282, 242, 304, 270), fill=GREEN)
    draw.arc((236, 276, 278, 306), 15, 165, fill=GREEN, width=8)
    draw.ellipse((126, 352, 178, 404), fill=CREAM, outline=GREEN, width=7)
    draw.ellipse((334, 352, 386, 404), fill=CREAM, outline=GREEN, width=7)

    if state == "idle":
        draw.line((350, 340, 410, 230), fill=GREEN, width=18)
        draw.ellipse((386, 176, 472, 280), outline=RACKET, width=16)
        draw.line((404, 206, 444, 250), fill=RACKET, width=4)
        draw.line((442, 206, 404, 250), fill=RACKET, width=4)
    elif state == "hit":
        draw.line((346, 350, 424, 274), fill=GREEN, width=18)
        draw.ellipse((394, 214, 488, 322), outline=RACKET, width=18)
        draw.line((420, 240, 462, 300), fill=RACKET, width=4)
        draw.line((460, 238, 420, 302), fill=RACKET, width=4)
        draw.arc((84, 250, 150, 330), 100, 260, fill="#9fb65b", width=6)
    else:
        draw.line((160, 300, 118, 190), fill=GREEN, width=18)
        draw.line((352, 300, 394, 190), fill=GREEN, width=18)
        draw.ellipse((354, 118, 448, 222), outline=RACKET, width=18)
        draw.arc((210, 300, 302, 334), 200, 340, fill=GREEN, width=10)
        for x, y in [(116, 112), (408, 84), (84, 270), (438, 296)]:
            draw.ellipse((x, y, x + 12, y + 12), fill="#c3d95d")
    image.save(OUT / f"pet-{state}.png", "PNG", optimize=True)


for name in ("idle", "hit", "ace"):
    base(name)
