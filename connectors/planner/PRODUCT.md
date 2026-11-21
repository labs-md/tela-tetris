# TelaTetris fabric planner

## Positioning

A Spanish-language browser portal for estimating how much fabric to buy for an order of garments. Purchasing comes first; the arrangement also explains where the pieces fit. This portal is separate from the TelaTetris arcade game.

## Operating context

A four-step wizard starts with an empty order: choose a garment, enter S–XL quantities, review the order, then calculate and inspect the fabric plan. Users choose T-shirt, straight-leg pants and unlined jacket presets. They can combine garment types and sizes, up to 12 garments per order. The fixed roll is 150 cm wide. The engine computes length in centimeters, and the portal recommends linear yards rounded up to the next quarter yard.

It runs directly from index.html without a build step. HTTP uses a worker; opening the file directly uses incremental main-thread work. The planner uses the shared Arrange engine and has independent garment data and interface files. It ships a synchronized engine copy inside its own folder so the page and worker also run from folder-restricted workspace previews. `npm run build:planner` refreshes that copy, and tests enforce synchronization.

## Product principles

- Show one step at a time, block empty or invalid quantities, and preserve the order when revisiting steps.
- Allow adding another garment and editing individual garment quantities from review.
- Cancel an active search when leaving the results step; a new order explicitly resets the journey.
- Show actual preset geometry during search and in the final layout.
- Derive purchase and layout from the same validated engine response.
- Clear the previous estimate immediately when order quantities change.
- Preserve grain direction with 0° and 180° rotations and a 1 cm gap.
- Label illustrative presets and purchase assumptions visibly.

## Evidence on hand

The engine independently checks bounds, overlap, rotations and completeness. These checks remain internal. Preset tests cover all garment types and sizes, mixed orders, invalid quantities and rounding. The browser smoke check covers file and HTTP operation, desktop/mobile overflow, replay and export.

## Scope and limits

The patterns and uniform size scaling are illustrative. They are not production sewing patterns or a universal sizing chart. The estimate excludes extra seam allowances, shrinkage, defects, pattern matching, lining and notions. The arrangement is a best effort within its search budget. The SVG is an illustrative measured layout, not a certified cutting file.

## Visual authority

The user explicitly requested a professional light theme that does not follow the game layout. The user subsequently requested a guided wizard. Four numbered steps separate garment selection, quantities, order review and calculated results while retaining the light identity. The portal uses the verified labs.gt Neuton and Inter fonts and white and light neutral surfaces, charcoal text, and LABS yellow/orange accents. The root PRODUCT.md and DESIGN.md continue to describe the separate arcade game.
