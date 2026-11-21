# Arrange materials planner

A separate Spanish-language purchasing portal for fabric and wood. Open [index.html](index.html) directly in a browser, serve this folder, or use a folder-restricted workspace preview. All runtime assets are included locally. The arcade game lives separately in [../telatetris](../telatetris/).

## Guided planning

Choose Tela or Madera, select presets, define quantities and measurements, review the order, then calculate the material to buy. Each material keeps its own draft when switching. Deselecting a preset clears that type's quantities. Editing invalidates the old estimate; leaving a running calculation cancels it.

For **Tela**, select playeras, pantalones and chumpas together. Each selected type gets independent S–XL quantities, up to 12 garments total. The Arrange engine nests preset polygons on a 150 cm roll with 1 cm spacing and 0°/180° rotation to preserve grain. The purchase is `ceil(lengthCm / 91.44 * 4) / 4`, rounded up to a quarter yard. Watch the arrangement, read the measured length and utilization, and download an SVG.

For **Madera**, choose custom straight cuts, shelves, cabinet sides, strips, stretchers, legs and 45° miter pieces. Edit length and width in centimeters, quantity, stock plank dimensions and thickness in centimeters, and saw kerf in millimeters. Initial dimensions are editable examples. Up to 100 parts share the stock thickness and keep their length along the grain. The result recommends whole planks of the entered size and shows a measured diagram and numbered part list for every plank, plus SVG export.

The woodworking allocator tries eight deterministic guillotine strategies and chooses the plan using the fewest planks. Every split reserves blade kerf. A miter's length runs between the outside tips; its rectangular blank reserves the angled offcuts. Bounds, kerf separation, identities and completeness are checked before displaying a result. The estimate does not prove the theoretical minimum. It excludes defects, end trimming, planing, thickness changes, bevels, grooves and joinery.

Textile patterns and size scaling are illustrative, not validated sewing patterns. Pants and jackets are unlined. No extra seam allowance, shrinkage, fabric defects, print matching, lining or notions are included. Review real patterns before buying or cutting. Exported SVGs illustrate the plan and are not certified cutting files.

## UI and local builds

The professional light interface keeps LABS yellow/orange accents and self-hosted Neuton and Inter fonts. The actual [Vercel UI SDK](https://github.com/vercel-labs/ui) Web Components own selection, numeric stepping, keyboard behavior and ARIA. The application handles project validation and calculation state. `window.plannerAgent` exposes the SDK agent bridge.

The checked-in SDK source is version `0.1.0-beta.14`, with its Apache license and SHA-256 manifest in `vendor/ui-sdk/`. The manifest identifies the retrieved archive and every source file. `ui-entry.js` imports only the components used here and the agent bridge. esbuild produces the local classic-script `ui-sdk.js`, so direct-file mode and scoped previews need no CDN or framework runtime.

The checked-in page needs no build. To rebuild after SDK or entry changes, install the pinned tooling with `pnpm install --frozen-lockfile`, then run `npm run build:planner:ui`. After changing the shared engine, run `npm run build:planner` to refresh the shipped `arrange.js` copy. Tests enforce that synchronization.

## Files

- `presets.js`: textile outlines, sizes, validation and purchase conversion.
- `woodworking.js`: wood presets, stock validation, allocation and report geometry.
- `planner.js`: material drafts, guided controls, canvas/SVG views and export.
- `planner-worker.js`: background textile search or woodworking allocation. Direct-file mode runs the same algorithms on the main thread.
- `planner.css`: responsive LABS workspace. [DESIGN.md](DESIGN.md) records its visual system.

## Verification

Run `npm test` for engine, game, preset, woodworking and isolated asset tests. Run `npm run test:planner:preview` with Node 22+ and Chrome to exercise both journeys under a nested, folder-restricted preview URL. `npm run test:planner:browser` serves the full project instead. Set `CHROME_PATH` if needed.

The browser check covers real SDK controls and the agent bridge, both materials, independent draft preservation, validation, multi-selection, back navigation, cancellation, new-order reset, HTTP workers, direct-file fallback, desktop/mobile overflow, reduced motion and both SVG exports.
