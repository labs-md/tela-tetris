# TelaTetris fabric planner

A separate Spanish-language purchasing portal. Open [index.html](index.html) directly in a browser. The existing [arcade game](../telatetris/index.html) is unchanged. No build, server or dependencies are required. The folder includes its engine and can also be served on its own or opened through a workspace-file preview.

Start with an empty order. Choose playeras, pantalones or chaquetas, set S–XL quantities, and combine up to 12 garments through the review step. Empty or invalid quantities block progression. Editing invalidates old estimates; leaving an active calculation cancels it. The Arrange engine nests the actual preset polygons on a fixed 150 cm roll with a 1 cm gap. Only 0° and 180° rotations are allowed to retain grain direction. Watch the arrangement, read the linear yards to buy, replay it, or download the layout as SVG.

The purchase is `ceil(lengthCm / 91.44 * 4) / 4`, rounded **up** to a quarter yard. The layout also reports its exact length and utilization. Editing any quantity invalidates the old purchase immediately. A worker keeps the UI responsive over HTTP; direct-file mode uses scheduled incremental search.

These are illustrative patterns, not validated production patterns. Size grading is a reference scale. Pants and jackets are unlined. No extra seam allowances, shrinkage, fabric defects, print matching, lining or notions are included. Review actual sewing patterns before purchasing or cutting.

## Design

The portal uses a professional light theme with [labs.gt](https://labs.gt) yellow and orange accents and its self-hosted Neuton and Inter fonts, inspected from the public site on 2026-11-21. A four-step wizard guides garment selection, quantities, order review and the calculated fabric plan. Back navigation preserves quantities; the review supports adding another garment, and the final step shows the measured layout and purchase summary. Font licenses are in `fonts/`. It uses no retro display fonts, scanlines, bevels, game timers or sound. The portal's visual system is recorded in [DESIGN.md](DESIGN.md); the root design system remains specific to the game.

## Files

- `arrange.js`: shipped copy of the shared Arrange engine, loaded locally by the page and worker so previews never need parent-folder assets. After changing the shared engine, run `npm run build:planner` to refresh it. Tests verify that the shipped engine stays synchronized.

- `presets.js`: independent garment geometry, order validation and purchase conversion, available in Node and the browser.
- `planner.js`: order controls, canvas animation, layout states and SVG export.
- `planner-worker.js`: off-thread arrangement using the shared engine.
- `planner.css`: responsive labs.gt-style workspace.

## Verification

Run `npm test` for engine, game, preset and isolated planner-asset tests. Run `npm run test:planner:preview` to exercise the wizard under the same nested, folder-restricted URL layout as workspace-file previews. Run `npm run test:planner:browser` with Node 22+ and Chrome for desktop/mobile captures and interaction checks. Set `CHROME_PATH` if Chrome is not installed in the standard macOS location. The browser check drives all four steps and covers empty/invalid quantity gates, back navigation, editing, mixed orders, cancellation, new-order reset, HTTP workers, direct-file fallback, reduced motion and SVG export.
