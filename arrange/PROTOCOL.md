# Arrange protocol, version 1

This is the contract between the engine and its connectors. A connector translates a domain (a garment order, a DXF file, an ERP job, a game) into a **request**. The engine answers with a **response**. Both are plain JSON, so a connector can be written in any language. Nothing in this document depends on JavaScript.

- Machine-readable schema: [`protocol.schema.json`](protocol.schema.json). Validate requests against `#/$defs/request` and responses against `#/$defs/response`.
- Example request: [`examples/minimal.json`](examples/minimal.json).
- Protocol id: `"arrange/1"`. A change that would break an existing connector gets a new id (`arrange/2`). Adding an optional field doesn't.

## Transports

| Transport | How |
|---|---|
| Command line | `node arrange/cli.js < request.json > response.json`. Exit code 0 means the engine answered (read `status`), 1 means the input wasn't JSON or the request was invalid. |
| JavaScript, one shot | `Arrange.run(request)` returns the response. `Arrange.solve` and `Arrange.evaluate` do the same with the task fixed. |
| JavaScript, incremental | `Arrange.session(request)` for connectors that search a little at a time or check layouts live. See [Sessions](#sessions). |

An HTTP or queue transport would wrap `Arrange.run` the same way the CLI does: one request in, one response out.

## Units and coordinates

The connector chooses the unit (mm, cm, inches) and labels it in `units`. The engine never interprets the label and echoes it back. Every length in a request and a response is in that unit.

Internally the engine works on a grid of square cells `cellSize` units wide. A smaller cell gives tighter layouts and slower runs. Placements land on the grid, so every `x` and `y` in a response is a multiple of `cellSize`. Rough guide: the T-shirt demo uses 1 cm cells, the metal connector 5 mm cells.

The strip's length runs along **x**, from 0 to the right, open-ended. Its width runs along **y**, from 0 at the top to `strip.width`, pointing **down**. Rotations are in degrees, clockwise as seen with y pointing down.

## Request

```json
{
  "protocol": "arrange/1",
  "task": "solve",
  "units": "mm",
  "cellSize": 5,
  "strip": {
    "width": 1000,
    "gap": 5,
    "maxLength": 3000,
    "blocked": [[[320, 380], [400, 360], [430, 430], [310, 450]]]
  },
  "items": [
    {
      "key": "l-bracket",
      "polygon": [[0, 0], [160, 0], [160, 40], [40, 40], [40, 120], [0, 120]],
      "rotations": [0, 90, 180, 270],
      "quantity": 6,
      "data": { "sku": "BR-160" }
    }
  ],
  "search": { "seed": 1, "iterations": 200, "timeMs": 5000 },
  "baseline": true
}
```

| Field | Required | Default | Meaning |
|---|---|---|---|
| `protocol` | yes | | Always `"arrange/1"`. |
| `task` | no | `"solve"` | `"solve"` searches for a short layout. `"evaluate"` checks and scores the layout in `placements`. |
| `units` | no | | A label for the connector's unit. |
| `cellSize` | no | `1` | Grid resolution, in units per cell. |
| `strip.width` | yes | | Usable width. Rounded down to whole cells. |
| `strip.gap` | no | `0` | Minimum distance between items, and from items to the edges and blocked regions. Rounded up to whole cells. |
| `strip.maxLength` | no | | The longest strip available. Items that don't fit go to `unplaced`. Without it the strip is as long as needed. |
| `strip.blocked` | no | `[]` | Polygons in strip coordinates that no item may cover: defects, clamps, holes in a remnant. |
| `items[].polygon` | yes | | The outline, 3 or more `[x, y]` points, at any position. Holes inside the outline are filled. |
| `items[].key` | no | the item's index | The connector's own id. It comes back on every placement. |
| `items[].rotations` | no | `[0]` | Allowed rotations. Fabric with a grain line uses `[0, 180]`, sheet metal `[0, 90, 180, 270]`. Multiples of 90 are exact. Other angles work, with some rounding at the outline. |
| `items[].quantity` | no | `1` | Copies of this item. |
| `items[].data` | no | | Anything. The engine never reads it. In JavaScript sessions it's available on the item. |
| `search.seed` | no | `1` | Same request and seed give the same layout. |
| `search.iterations` | no | `200` | How many item orders to try, the first pass included. |
| `search.timeMs` | no | `5000` | Time budget. The search stops at whichever limit comes first. |
| `baseline` | no | `true` | Also lay out the items by shelves and report that length, as the number to beat. |
| `placements` | for `evaluate` | | The layout to check, see below. |

### Item indices

The engine expands quantities in order and numbers the copies from 0. With items `A` (quantity 2) and `B` (quantity 1), item 0 is `A` copy 0, item 1 is `A` copy 1 and item 2 is `B` copy 0. Responses use these indices in `item` and `unplaced`, and `evaluate` uses them to say which item each placement is.

### Evaluate

`evaluate` checks a layout made somewhere else (a person, a CAD operator, a previous system) against the same rules as the engine's own, and scores it. Each placement is:

```json
{ "item": 0, "rotation": 90, "x": 5, "y": 135 }
```

`x` and `y` are the top-left corner of the item's bounding box after rotation. Values are snapped to the nearest cell. `rotation` defaults to 0 and must be one the item allows.

## Response

```json
{
  "protocol": "arrange/1",
  "status": "ok",
  "units": "mm",
  "length": 330,
  "utilization": 0.544148,
  "placements": [
    {
      "item": 0, "key": "bracket", "copy": 0, "rotation": 270,
      "x": 5, "y": 135,
      "translate": [5, 295],
      "polygon": [[5, 295], [5, 135], [45, 135], [45, 255], [125, 255], [125, 295]]
    }
  ],
  "unplaced": [],
  "check": { "inBounds": true, "noOverlap": true, "rotations": true, "complete": true, "ok": true },
  "baseline": { "length": 560, "utilization": 0.31851 },
  "stats": { "iterations": 40, "ms": 249, "grid": { "width": 60, "length": 180 }, "cellSize": 5 }
}
```

| Field | Meaning |
|---|---|
| `status` | `ok`: every item placed, every rule kept. `incomplete`: some items are in `unplaced` (only with `maxLength`, or an evaluated layout that leaves items out). `rejected`: the layout breaks a rule (only from `evaluate`). `invalid`: the request is malformed. Read `errors`. |
| `errors` | Only with `invalid`. One message per problem found, so a connector can show them all at once. |
| `length` | Strip used, from 0 to the end of the last item. This is the number to minimize. |
| `utilization` | Total item area ÷ strip area used (`length × width`, minus blocked cells). |
| `placements[]` | Where each item went. `x`, `y`: top-left of its bounding box. `polygon`: the placed outline, ready to draw or cut. `translate`: to transform the original outline yourself (for example a DXF block), rotate it by `rotation` about its own origin, then add `translate`. |
| `unplaced` | Item indices that didn't fit. |
| `check` | The engine re-checks every response from scratch: `inBounds` (inside the strip), `noOverlap` (no overlap and the gap kept), `rotations` (only allowed rotations), `complete` (every item exactly once). |
| `baseline` | The shelf layout's length and utilization. Absent when the request sets `baseline: false`. |
| `stats` | `solve` only. Orders tried, time spent, grid size in cells. |

## The placement rules

The same two rules apply to the search, the baseline and `evaluate`:

1. An item's body, meaning every cell its outline touches, may not overlap another body or a blocked cell.
2. The body grown by `gap` must stay on the strip and may not touch another body or a blocked cell.

So items end up at least `gap` apart, diagonals included, and `gap` away from the edges and blocked regions. The engine rasterizes conservatively: a cell counts as occupied if the outline touches it at all. Measured on the real outlines, items are never closer than `gap`, and may be up to about a cell further apart than they need to be. That slack is the price of the grid, and a smaller `cellSize` shrinks it.

## Sessions

`Arrange.session(request)` is for connectors that can't wait for a single answer, such as a UI that shows progress or a game. It throws on an invalid request (call `Arrange.checkRequest` first to get the messages).

| Member | Meaning |
|---|---|
| `step(ms)` | Search for about `ms` milliseconds, at least one order. Returns `{ iterations, length, initialLength, ms }`. |
| `progress()` | The same, without searching. |
| `done` | True once the request's `iterations` or `timeMs` budget is used up. |
| `result()` | The `solve` response for the best layout so far. |
| `evaluate(placements)` | The `evaluate` response for a layout. |
| `reset()` | Drop the search and start over on the next `step`. |
| `problem` | The core problem, in cells, for live checks such as "does this piece fit here". See [README](README.md#core-api). Using it ties a connector to the JavaScript engine. |

## Writing a connector

1. Map the domain's shapes to `items`: outline, allowed rotations, quantity. Use `key` for your id, so you never have to track indices.
2. Describe the material in `strip`: width, gap, defects as `blocked`.
3. Pick `cellSize`. Start around 1/100 of the strip width and halve it if the layouts look loose.
4. Send the request. Check `status`, then use `placements[].polygon`, or `translate` and `rotation`, to write the output format: an SVG, a DXF, a cutting file, a screen.
5. To compare against what the domain does today, send that layout as an `evaluate` request.

The connectors in [`../connectors/`](../connectors) are worked examples: `telatetris` (a browser game, using a session) and `sheet-metal` (a Node script, using `solve` and the CLI).
