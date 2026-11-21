# Arrange materials planner

## Positioning

A Spanish-language browser portal for estimating fabric or whole planks to buy. The calculated arrangement explains where each piece fits. This portal is separate from the TelaTetris arcade game.

## Operating context

The light four-step wizard guides preset selection, quantities and measurements, review, then a calculated purchase with a visible layout. A material selector switches between separate textile and woodworking drafts.

Textiles support any combination of playeras, pantalones and chumpas, with independent S–XL quantities for every selected type and a 12-garment total limit. A 150 cm roll, 1 cm gap and 0°/180° rotation preserve grain. Purchase is linear yards rounded up to a quarter yard.

Woodworking supports custom straight cuts, shelves, cabinet sides, strips, stretchers, legs and double-ended 45° miter blanks. Dimensions and thickness are centimeters; blade kerf is millimeters. Stock dimensions are editable, and initial values are examples. All parts share the plank thickness and maintain lengthwise grain. Up to 100 parts are allocated to whole planks of the entered size. Results show every plank, numbered pieces, dimensions and utilization.

All runtime assets are local, including the real Vercel UI SDK Web Components, agent bridge and shared Arrange engine copy. The page works over HTTP, from a direct file, or through folder-restricted previews. HTTP uses a worker; direct-file mode schedules calculation on the main thread. The checked-in page needs no build. Local build scripts regenerate the engine copy and SDK bundle.

## Product principles

- Show one step at a time and block empty or invalid orders.
- Preserve drafts when revisiting steps or switching material; deselecting a type removes its quantities.
- Validate all fields together so another valid field cannot hide an invalid draft.
- Clear stale purchase results on any edit and cancel active work when leaving results.
- Derive purchase and visible layouts from the same validated calculation.
- Show actual geometry and label units at the relevant controls and measurements.
- Preserve grain and reserve saw kerf for wood.
- Keep illustrative values and estimate exclusions visible.

## Evidence on hand

The textile engine independently checks bounds, overlap, rotations and completeness. The wood allocator checks bounds, identities, completeness and kerf separation. Tests cover all catalogs, mixed orders, limits, rounding, kerf-sensitive purchase counts, exact fits and miter blanks. Browser checks cover real SDK interaction and its agent bridge, both materials, worker/direct-file operation, desktop/mobile layouts and SVG exports.

## Scope and limits

Textile patterns and size scaling are illustrative. The estimate excludes extra seam allowance, shrinkage, defects, print matching, lining and notions. Review actual sewing patterns before buying or cutting.

The wood plan uses finite rectangular stock and guillotine splits. Miters reserve rectangular blanks and count angled offcuts as waste. It excludes defects, end trimming, planing, thickness changes, bevels, grooves and joinery. Neither material guarantees the theoretical minimum purchase. SVGs are illustrative measured layouts, not certified cutting files.

## Visual authority

The user requested Spanish, a professional light LABS interface, a guided wizard, and Vercel UI SDK controls. Retain white/light neutral surfaces, charcoal text, Neuton headings, Inter controls, LABS yellow/orange accents and responsive task-focused panels. The root product and design files describe the separate arcade game.
