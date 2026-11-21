# Arrange + TelaTetris

Arrange lays out irregular shapes on a strip of fixed width so they use as little length as possible. It doesn't care what the strip is. A fabric roll, a steel coil and a glass panel are the same problem once you say how wide the strip is, how far apart parts must stay, which rotations each part allows, and where the strip has defects.

TelaTetris is the demo built on it: you lay out a T-shirt order on a fabric roll against the clock, then the engine rearranges your own pieces and shows how much roll it saves.

| Path | What it is |
|---|---|
| [`arrange/`](arrange/README.md) | The engine. One dependency-free JS file for browser and Node. API and model are in its README. |
| [`demo/`](demo/README.md) | TelaTetris, the fabric use case. Open `demo/index.html`. |
| `examples/sheet-metal.js` | A second use case: steel parts on a 1 m coil, 90° rotations, a rust spot to avoid. |
| `test/` | Engine tests. |
| [`reference/`](reference/README.md) | The paper's algorithm in Python. |

```sh
npm test                                   # engine tests (Node 18+)
node examples/sheet-metal.js layout.svg    # pack the metal parts, write an SVG
```

## Adding a use case

Write a small module like `demo/garments.js` that turns your domain's input into item specs: an outline in cells, the allowed rotations, a quantity, and whatever `data` you want back. Pass them to `Arrange.createProblem` with the strip width, gap and any blocked regions. Everything after that (packing, the shelf baseline, validation, metrics) is the engine's job.
