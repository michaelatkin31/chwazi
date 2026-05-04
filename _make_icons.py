"""Generate Chwazi icons: three colored rings on a dark rounded square."""
from PIL import Image, ImageDraw
import math

BG = (10, 10, 10, 255)
RINGS = [
    ("#FF5252", 0.0),    # red, top
    ("#40C4FF", 2.0944), # blue, bottom-left (120 deg)
    ("#FFD740", 4.1888), # yellow, bottom-right (240 deg)
]


def make_icon(size: int, path: str, rounded: bool = True):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background
    radius = int(size * 0.22) if rounded else 0
    if rounded:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)
    else:
        d.rectangle((0, 0, size - 1, size - 1), fill=BG)

    cx, cy = size / 2, size / 2
    # Triangle radius (distance from center to each ring center)
    tri_r = size * 0.20
    ring_outer = size * 0.18
    ring_thickness = max(2, int(size * 0.045))

    for hex_color, angle in RINGS:
        # angle 0 = up
        x = cx + math.sin(angle) * tri_r
        y = cy - math.cos(angle) * tri_r
        bbox = (
            x - ring_outer,
            y - ring_outer,
            x + ring_outer,
            y + ring_outer,
        )
        # Convert hex to RGB
        r = int(hex_color[1:3], 16)
        g = int(hex_color[3:5], 16)
        b = int(hex_color[5:7], 16)
        d.ellipse(bbox, outline=(r, g, b, 255), width=ring_thickness)
        # Inner dot
        dot_r = size * 0.028
        d.ellipse(
            (x - dot_r, y - dot_r, x + dot_r, y + dot_r),
            fill=(r, g, b, 255),
        )

    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    # apple-touch-icon should be solid (no transparency) and not rounded —
    # iOS applies the rounding itself.
    make_icon(180, "icon-180.png", rounded=False)
    make_icon(192, "icon-192.png", rounded=True)
    make_icon(512, "icon-512.png", rounded=True)
