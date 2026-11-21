# Materials planner extension

The existing four-step light LABS wizard becomes a materials planner with textile and woodworking projects. Keep the arcade connector untouched.

Two shapes considered: separate complete wizards per material, or one wizard over domain data and calculation modules. Choose one wizard to keep navigation, validation, selection, preview packaging and purchase reporting consistent. Each material owns its catalog and geometric rules; the shared controller owns the active step and draft order.

- `presets.js`: existing textile outlines, sizes and yardage conversion.
- `woodworking.js`: editable cut presets, stock/kerf validation, deterministic finite-board guillotine allocation, and report data. Centimeters at the boundary, millimeters internally. All parts share stock thickness and retain grain orientation. A 45-degree miter uses a rectangular blank reservation, with the angled offcuts included in waste.
- `planner.js`: active material, separate draft projects, wizard navigation, unified field validation, async calculation lifecycle and real result rendering.
- `planner-worker.js`: textile search or woodworking calculation, returning material-specific reports.
- `ui-entry.js`: official Vercel UI SDK Web Components and the agent bridge, built to a local classic script. The browser never imports from a CDN.

The SDK source snapshot is vendored from https://github.com/vercel-labs/ui at version 0.1.0-beta.14 with its Apache license and per-file SHA-256 manifest. esbuild bundles it for local HTML and folder-restricted previews. This avoids changing the dependency-free engine or requiring a framework runtime. Build tooling is pinned in pnpm-lock.yaml.

Wood purchase is a whole-number count of one editable stock size. Rectangular parts and rectangular miter blanks use orthogonal guillotine splits with blade kerf deducted. The result is best effort, not a proof of minimum purchase. Bounds, identities, quantities and kerf separation are independently checked before reporting a plan. Wood defects, end trimming, planing and thickness changes are outside the estimate.
