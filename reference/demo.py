"""Pack synthetic irregular parts and save a picture of the layout.
Scale: 1 px = 0.5 mm, gap 4 mm = 8 px (the paper's settings)."""
import sys
import time

import numpy as np
from PIL import Image

from ncc_packing import NCCPacker


def ring_sector(r_out, r_in, a0, a1):
    y, x = np.mgrid[-r_out:r_out + 1, -r_out:r_out + 1]
    r, a = np.hypot(x, y), np.degrees(np.arctan2(y, x)) % 360
    return (r <= r_out) & (r >= r_in) & (a >= a0) & (a <= a1)


def star(r_out, r_in, n=5):
    y, x = np.mgrid[-r_out:r_out + 1, -r_out:r_out + 1]
    a, r = np.arctan2(y, x), np.hypot(x, y)
    t = (a % (2 * np.pi / n)) / (2 * np.pi / n)
    edge = r_in + (r_out - r_in) * np.abs(1 - 2 * t)
    return r <= edge


def l_shape(h, w, t):
    m = np.zeros((h, w), bool)
    m[:, :t] = True
    m[-t:, :] = True
    return m


def t_shape(h, w, t):
    m = np.zeros((h, w), bool)
    m[:t, :] = True
    m[:, (w - t) // 2:(w + t) // 2] = True
    return m


def disk_with_hole(r, r_hole):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    d = np.hypot(x, y)
    return (d <= r) & (d >= r_hole)


rng = np.random.default_rng(0)
parts = []
for i in range(4):
    parts.append((f"L{i}", l_shape(rng.integers(120, 180), rng.integers(80, 140), 40)))
for i in range(4):
    parts.append((f"T{i}", t_shape(rng.integers(100, 150), rng.integers(100, 160), 36)))
for i in range(4):
    parts.append((f"arc{i}", ring_sector(rng.integers(70, 100), 40, 0, 180)))
for i in range(4):
    parts.append((f"star{i}", star(rng.integers(40, 60), 20)))
for i in range(3):
    parts.append((f"ring{i}", disk_with_hole(rng.integers(35, 50), 15)))
for i in range(6):
    parts.append((f"rect{i}", np.ones((rng.integers(30, 70), rng.integers(30, 90)), bool)))

H, W = 500, 1400   # 250 mm x 700 mm board
packer = NCCPacker(H, W, gap_px=8)
t0 = time.perf_counter()
packer.pack(parts)
dt = time.perf_counter() - t0

print(f"placed {len(packer.placements)}/{len(parts)} parts in {dt:.1f}s")
print(f"unplaced: {packer.unplaced}")
print(f"occupied width L_o = {packer.L_o} px ({packer.L_o * 0.5:.0f} mm)")
print(f"utilization (material / H*L_o) = {packer.utilization():.1%}")
for p in packer.placements[:5]:
    print(f"  {p.name:7s} row={p.row:4d} col={p.col:4d} rot={90 * p.rot_k:3d} ncc={p.score:.3f}")

# Render: each part a colour, dilated clearance in dark grey, L_o line in red.
pal = (rng.random((len(parts) + 1, 3)) * 180 + 60).astype(np.uint8)
img = np.full((H, W, 3), 25, np.uint8)
img[packer.occ] = (60, 60, 60)
mask = packer.layout > 0
img[mask] = pal[packer.layout[mask]]
img[:, min(packer.L_o, W - 1)] = (220, 40, 40)
out = sys.argv[1] if len(sys.argv) > 1 else "layout.png"
Image.fromarray(img).save(out)
print("saved", out)
