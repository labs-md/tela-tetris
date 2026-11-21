# Arrange engine

`arrange.js` has two layers:

- the **protocol layer** (`run`, `solve`, `evaluate`, `session`, `checkRequest`), which is what connectors use. It takes JSON in the connector's units. Spec: [PROTOCOL.md](PROTOCOL.md).
- the **core** (`createProblem`, `Board`, geometry helpers), which works in grid cells. The protocol layer is built on it. Interactive connectors reach it through `session.problem` when they need live checks, like the game does while you drag a piece.

If you're writing a connector, start with [PROTOCOL.md](PROTOCOL.md). This page covers the core.

## Core API

```js
const problem = Arrange.createProblem({
  width: 200,                  // strip width, in cells
  gap: 1,                      // min distance between items and from edges, in cells
  items: [
    { polygon: [[0, 0], [32, 0], [32, 8], [8, 8], [8, 24], [0, 24]],
      rotations: [0, 90, 180, 270], quantity: 6, data: { name: 'L bracket' } },
  ],
  blocked: [[[64, 72], [80, 72], [86, 86], [62, 90]]],
});
const best = problem.pack({ timeMs: 2000 });   // { placements, length, failed, iterations }
```

Core placements are `{ id, rot, x, y }` in cells, where `id` is the item index and `(x, y)` is the top-left cell of the rotated bounding box. The protocol layer renames them to `{ item, rotation, x, y }` and scales them to units.

| Method | Returns |
|---|---|
| `pack({ seed, iterations = 200, timeMs, length })` | Best layout within the budget. |
| `search({ seed, length })` | A stepper: `step()`, `best`, `initial`, `iterations`, `order`. |
| `greedy(order?, length?)` | One pass in the given order (default: largest first). |
| `shelf(ids?, start = 0)` | The baseline. Bounding boxes in columns, longest first. `start` shifts the first column, which the game uses to fill in after the player's cut line. |
| `board(length)` | A mutable `Board` with blocked cells painted in: `fits(item, rot, x, y, ignoreId?)`, `fitsVariant(v, x, y)`, `place`, `remove`, `ownerAt(x, y)` (item id, -1 when free, -2 when blocked). |
| `validate(placements, length?)` | `{ inBounds, noOverlap, rotations, complete, ok }`. |
| `metrics(placements)` | `{ length, area, used, utilization, waste }`. |
| `layoutLength(placements)` | Last occupied column + 1. |
| `defaultLength()` | The strip length used when none is given: 1.3 × the shelf layout plus the largest item. |

`problem.items[id]` is `{ id, polygon, w, h, area, rotations, variants, data }`. Each variant is one rotation: `poly` (the outline, moved to start at 0,0), `body` and `tmpl` (rasters), `w`/`h`. `Arrange.variantOf(item, rot)` picks one, for example to draw it.

Geometry helpers: `polygonArea`, `normalizePolygon`, `scalePolygon`, `rotatePolygon` (clockwise with y down, exact for multiples of 90°).

## Inside a greedy pass

For each item in order, `nccGreedy`:

1. Builds the inverted strip: 1 for a free cell, 0 for a body or blocked cell, with a 1-cell border of 0s.
2. Fills free regions smaller than the item's template. They can never take it, and leaving them in would reward positions next to useless gaps. This happens per item, since a hole too small for a sleeve may still fit a pocket.
3. Builds an integral image and row prefix sums of the inverted strip, so the free-cell count of any rectangle or template row costs O(1).
4. For every rotation and every position inside the search window, keeps the position only if every template cell is free (the overlap test, Eq. 9 in the paper). It then scores the position with normalized cross-correlation between the template and the free space in its bounding box plus a 1-cell margin (Eq. 6, simplified for binary images). Ties go to the leftmost, then topmost, position.
5. The window starts at 1.5 × the item's largest side, or at the current layout end minus that side once items are down (Eqs. 8 and 12). It widens by one item side until something fits (Eq. 13).

The template is the body grown by `gap`. A cell joins the template when its nearest edge is closer than `gap` to a body cell, so no two bodies end up closer than `gap`, diagonals included. For a 1-cell gap this is exactly the paper's disk (Eq. 1). For larger gaps the paper's disk would let corners get closer, so the engine doesn't use it.

`search` wraps the pass: start from largest-first, mutate the order (swap two items or move one), keep the mutation if the layout is no longer, prefer fewer failed items over a shorter length. Runs are deterministic for a given seed.

Cost per pass is about `items × rotations × width × window × template rows`. The garment order (24 pieces, 2 rotations, 150 × ~400 cells) takes about 35 ms. Halving `cellSize` roughly multiplies that by 8: four times the cells, and templates with twice as many rows.

The equation numbers refer to Meng et al., *Scientific Reports* 15, 12320 (2025), doi:[10.1038/s41598-025-97202-0](https://doi.org/10.1038/s41598-025-97202-0). The full citation is in the [root README](../README.md#citation). `../reference/ncc_packing.py` is the paper's method in Python, with comments pointing to its equations.
