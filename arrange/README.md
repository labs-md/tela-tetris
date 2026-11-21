# Arrange

Lays out irregular shapes on a strip of fixed width and open length, using as little length as it can. Fabric rolls, steel coils, glass or wood panels and paper all fit this shape of problem. One file, no dependencies. It runs in the browser (`window.Arrange`) and in Node (`require('./arrange/arrange.js')`).

```js
const problem = Arrange.createProblem({
  width: 200,                  // strip width, in cells
  gap: 1,                      // min distance between items and from edges
  items: [
    { polygon: [[0, 0], [32, 0], [32, 8], [8, 8], [8, 24], [0, 24]],
      rotations: [0, 90, 180, 270], quantity: 6, data: { name: 'L bracket' } },
    { polygon: [[0, 0], [22, 0], [0, 22]], rotations: [0, 90, 180, 270], quantity: 8 },
  ],
  blocked: [[[64, 72], [80, 72], [86, 86], [62, 90]]],   // a defect no item may cover
});

const best = problem.pack({ timeMs: 2000 });   // { placements, length, failed, iterations }
problem.validate(best.placements).ok;           // true
problem.metrics(best.placements).utilization;   // item area / strip area used
```

## The model

Everything is a grid of square cells. The engine doesn't know what a cell measures. You pick a cell size, convert your outlines to cells (`Arrange.scalePolygon(poly, 1 / mmPerCell)`) and convert results back. Smaller cells give tighter layouts and slower runs, since the cost of one pass grows with `width × length` per item. The fabric demo uses 1 cm cells, the metal example 5 mm.

The strip's length runs along x and its width along y, with y pointing down. A placement is `{ id, rot, x, y }`: the item id, its rotation in degrees, and the top-left cell of its bounding box.

Two rules decide whether a placement is legal. Every method (interactive boards, the shelf baseline, the algorithm, the validator) uses the same two:

- an item's body, meaning every cell its outline touches, may not overlap another body or a blocked cell;
- the body grown by `gap` cells must stay on the strip and may not touch another body or a blocked cell.

So items end up at least `gap` cells apart, and `gap` cells away from the edges and from blocked regions.

## Items

`items` takes specs:

| Field | Default | Meaning |
|---|---|---|
| `polygon` | required | Outline in cells. Any position: the engine moves it to (0, 0). |
| `rotations` | `[0]` | Allowed rotations in degrees, clockwise on screen. Multiples of 90 are exact; other angles work but rasterize with rounding. Fabric with a grain line uses `[0, 180]`. |
| `quantity` | `1` | Copies. They share rasters and get consecutive ids. |
| `data` | `undefined` | Anything you want back on the item (name, color, SKU). The engine never reads it. |

`problem.items[id]` gives `{ id, polygon, w, h, area, rotations, variants, data }`. Each variant holds one rotation's outline (`poly`), raster (`body`) and grown raster (`tmpl`). Use `Arrange.variantOf(item, rot)` to get one, for example to draw it.

## Methods

All lengths are in cells and optional. They default to a bound that is always long enough (1.3 × the shelf layout plus the largest item).

| Method | Returns |
|---|---|
| `pack({ seed, iterations = 200, timeMs, length })` | Best layout found within the iteration or time budget. |
| `search({ seed, length })` | A stepper: call `step()` as often as you have time, read `best`, `initial`, `iterations`, `order`. Use this in a UI so the search runs between frames. |
| `greedy(order?, length?)` | One placement pass in the given item order (default: largest first). |
| `shelf(ids?, start = 0)` | Baseline: bounding boxes in columns, longest first, no nesting. It's how people often lay out by hand, so it's the number to beat. `start` shifts the first column. |
| `board(length)` | A mutable `Board` with the blocked cells painted in, for interactive placement: `fits`, `place`, `remove`, `ownerAt`. |
| `validate(placements, length?)` | `{ inBounds, noOverlap, rotations, complete, ok }`, checked from scratch on a fresh board. |
| `metrics(placements)` | `{ length, area, used, utilization, waste }`. `used` leaves blocked cells out. |
| `layoutLength(placements)` | Last occupied column + 1. |

A result with `failed > 0` means some items didn't fit in `length`. Pass a longer one.

## The algorithm

Each greedy pass follows Meng et al., *Sci. Rep.* 15:12320 (2025), doi:10.1038/s41598-025-97202-0. For each item, in order, it scores every free position with normalized cross-correlation between the inverted strip and the item's grown raster, in every allowed rotation. It searches only a window near the left that widens as needed, so the layout grows from left to right. Before scoring, it fills free pockets too small to hold the item. Integral images keep the scoring at a handful of additions per position.

The paper places items once, largest first. `search` and `pack` add a random order search on top: swap or move one item, run a pass, keep the new order if the layout isn't longer. On the demo's 4-shirt order (24 pieces, 150 cm roll), 3.5 s of search took the single pass from 333 cm to 285 cm. Shelves need 360 cm.

`../reference/ncc_packing.py` is the paper's method in Python, with comments pointing to its equations.

## Limits

- One open-ended strip. There is no multi-sheet bin packing with fixed-size sheets yet.
- No mirroring. Add a mirrored copy of the polygon as its own spec if flipping is allowed.
- Holes inside a polygon are filled, so nothing nests inside a part's cut-out.
- The objective is strip length (then fewest failed items). Other objectives would need a new comparison in `search`.
