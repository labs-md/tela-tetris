"""
Reference implementation of the packing method in
Meng et al., "Optimizing 2D irregular packing via image processing and
computational intelligence", Sci. Rep. 15:12320 (2025).
https://doi.org/10.1038/s41598-025-97202-0

Everything is a raster: parts and board are boolean images where one pixel
equals a fixed length (the paper uses 0.5 mm/px).

Pipeline (paper section in brackets):
  1. Dilate every part by gap/2 so non-overlapping parts keep `gap` apart  [Eq. 1]
  2. Crop to bounding box, add a 1-px empty margin  [Template pre-processing]
  3. Sort parts by Lh + Lv, largest first  [Eq. 2]
  4. For each part:
       a. fill free-space holes too small for the part  [Filling the holes]
       b. NCC between the inverted board and the part at 0/90/180/270 deg  [Eq. 6]
       c. keep only placements fully on the board  [first crop]
       d. keep only placements near the left / inside the occupied width  [second crop, Eqs. 8-13]
       e. sort candidates by NCC, take the first one that does not overlap  [Eq. 9]
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage
from scipy.signal import fftconvolve


# ---------------------------------------------------------------- helpers ---

def disk(radius: float) -> np.ndarray:
    r = int(np.ceil(radius))
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= radius * radius


def expand(mask: np.ndarray, gap_px: int) -> np.ndarray:
    """Eq. 1: a pixel becomes 1 if it lies within a disk of radius
    sqrt((pg/2+1)^2 - 1) of a part pixel, i.e. dilation by a disk."""
    radius = np.sqrt((gap_px / 2 + 1) ** 2 - 1) if gap_px > 0 else 0
    pad = int(np.ceil(radius))
    m = np.pad(mask, pad)
    return ndimage.binary_dilation(m, structure=disk(radius)) if radius else m


def crop_to_content(mask: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(mask)
    return mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def normxcorr_valid(image: np.ndarray, templ: np.ndarray) -> np.ndarray:
    """Eq. 6 (same as MATLAB normxcorr2 / OpenCV TM_CCOEFF_NORMED), 'valid'
    region only. Output[y, x] = NCC with the template's top-left at (y, x).
    Windows with zero variance (e.g. entirely free space) score 0."""
    image = image.astype(np.float64)
    t = templ.astype(np.float64)
    n = t.size
    t0 = t - t.mean()
    t_energy = np.sum(t0 * t0)
    # Numerator: sum_ij s(i,j) * (t - t_mean); the s_mean term cancels.
    num = fftconvolve(image, t0[::-1, ::-1], mode="valid")
    # Local sums of s and s^2 over each window -> sum (s - s_mean)^2.
    ones = np.ones_like(t)
    s1 = fftconvolve(image, ones, mode="valid")
    s2 = fftconvolve(image * image, ones, mode="valid")
    s_energy = np.maximum(s2 - s1 * s1 / n, 0)
    den = np.sqrt(s_energy * t_energy)
    out = np.zeros_like(num)
    ok = den > 1e-6 * n
    out[ok] = num[ok] / den[ok]
    return out


# ------------------------------------------------------------------ model ---

@dataclass
class Part:
    name: str
    shape: np.ndarray        # original boolean mask, 1 = material
    expanded: np.ndarray     # dilated by gap/2 and cropped (used for packing)

    @property
    def L_t(self) -> int:    # Eq. 2
        h, w = self.expanded.shape
        return h + w

    @property
    def L_max(self) -> int:  # L_p-max in Eqs. 10-13
        return max(self.expanded.shape)


@dataclass
class Placement:
    name: str
    row: int
    col: int
    rot_k: int               # rotation = 90 * rot_k degrees counter-clockwise
    score: float


class NCCPacker:
    def __init__(self, board_h: int, board_w: int, gap_px: int = 8,
                 lr_window: float = 1.5, tie_break_left: bool = True):
        self.H, self.W = board_h, board_w
        self.gap = gap_px
        self.k = lr_window
        self.tie_break_left = tie_break_left
        self.occ = np.zeros((board_h, board_w), bool)   # dilated parts + filled holes
        self.layout = np.zeros((board_h, board_w), np.int32)  # original shapes, labelled
        self.L_o = 0                                     # occupied width
        self.placements: list[Placement] = []
        self.unplaced: list[str] = []

    def make_part(self, name: str, mask: np.ndarray) -> Part:
        mask = crop_to_content(mask.astype(bool))
        exp = crop_to_content(expand(mask, self.gap))
        return Part(name, mask, exp)

    # -- step 4a ------------------------------------------------------------
    def fill_small_holes(self, min_pixels: int) -> None:
        free_lbl, n = ndimage.label(~self.occ)          # 4-connectivity, like bwconncomp(...,4)
        if n == 0:
            return
        sizes = ndimage.sum_labels(np.ones_like(free_lbl), free_lbl, np.arange(1, n + 1))
        small = np.flatnonzero(sizes < min_pixels) + 1
        self.occ |= np.isin(free_lbl, small)

    # -- steps 4b-4d --------------------------------------------------------
    def candidates(self, part: Part, L_r: float):
        # Inverted substrate: free = 1, occupied = 0. Pad with 1 px of 0 so the
        # template's 1-px empty margin may hang over the board edge; the edge
        # then counts as "occupied" and the part is rewarded for touching it.
        sub = np.pad((~self.occ).astype(np.float64), 1)
        cands = []
        for k in range(4):
            body = np.rot90(part.expanded, k)
            templ = np.pad(body, 1).astype(np.float64)   # 1-px margin (Fig. 6)
            R = normxcorr_valid(sub, templ)              # first crop is implicit:
            # R[y, x] -> template top-left at padded (y, x) -> body top-left at
            # board (y, x), i.e. (u, v) of Eq. 7 shifted by +1. Body always fits.
            v_max = int(min(R.shape[1] - 1, L_r))         # second crop (columns)
            R = R[:, :v_max + 1]
            ys, xs = np.mgrid[:R.shape[0], :R.shape[1]]
            cands.append(np.stack([R.ravel(), np.full(R.size, k), ys.ravel(), xs.ravel()], 1))
        c = np.concatenate(cands)
        if self.tie_break_left:   # not in the paper: break NCC ties toward left/top
            order = np.lexsort((c[:, 2], c[:, 3], -c[:, 0]))
        else:
            order = np.argsort(-c[:, 0], kind="stable")
        return c[order]

    def fits(self, body: np.ndarray, r: int, c: int) -> bool:
        h, w = body.shape
        if r < 0 or c < 0 or r + h > self.H or c + w > self.W:
            return False
        return not np.any(self.occ[r:r + h, c:c + w] & body)   # Eq. 9

    # -- step 4 -------------------------------------------------------------
    def place(self, part: Part, label: int) -> Placement | None:
        if self.placements:
            self.fill_small_holes(int(part.expanded.sum()))
        Lp = part.L_max
        if not self.placements:
            L_r = self.k * Lp                                  # Eq. 8
        else:
            L_r = max(self.k * Lp, self.L_o - Lp)              # Eq. 12
        tried: set[tuple[int, int, int]] = set()
        while True:
            c = self.candidates(part, L_r)
            half = len(c) // 2
            for i, (score, k, r, col) in enumerate(c):
                key = (int(k), int(r), int(col))
                if key in tried:
                    continue
                tried.add(key)
                body = np.rot90(part.expanded, int(k))
                if self.fits(body, int(r), int(col)):
                    return self._commit(part, label, int(k), int(r), int(col), float(score))
                if i > half and L_r < self.W:   # Eq. 13: widen window after half the list
                    break
            if L_r >= self.W:
                return None             # nothing fits on this board
            L_r += Lp

    def _commit(self, part, label, k, r, c, score) -> Placement:
        body = np.rot90(part.expanded, k)
        h, w = body.shape
        self.occ[r:r + h, c:c + w] |= body
        # Original (un-dilated) shape sits centred inside its dilated body.
        shp = np.rot90(part.shape, k)
        oy, ox = (h - shp.shape[0]) // 2, (w - shp.shape[1]) // 2
        win = self.layout[r + oy:r + oy + shp.shape[0], c + ox:c + ox + shp.shape[1]]
        win[shp] = label
        self.L_o = max(self.L_o, c + w)
        p = Placement(part.name, r, c, k, score)
        self.placements.append(p)
        return p

    def pack(self, named_masks: list[tuple[str, np.ndarray]]):
        parts = [self.make_part(n, m) for n, m in named_masks]
        parts.sort(key=lambda p: p.L_t, reverse=True)           # Eq. 2
        for i, p in enumerate(parts, start=1):
            if self.place(p, i) is None:
                self.unplaced.append(p.name)
        return self.placements

    # -- metrics ------------------------------------------------------------
    def utilization(self) -> float:
        """Material area / used strip area (board height x occupied width)."""
        return float((self.layout > 0).sum()) / (self.H * max(self.L_o, 1))
