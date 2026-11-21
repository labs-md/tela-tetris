# TelaTetris

TelaTetris is the Spanish-language browser demo for the Arrange engine. A player lays out a T-shirt order on a fabric roll against a 90-second clock. TelaTetris rearranges the same pieces and compares roll length and fabric use with the player's layout and a shelf layout.

The demo opens from `connectors/telatetris/index.html` without a build step or server. It uses a 150 cm roll, 1 cm cells, a 1 cm cutting gap, and 0° or 180° rotations to preserve the grain line. Orders use S, M, L, and XL sizes. The piece queue is randomized. Queue controls group the same piece type and size, with remaining quantities that include the held piece.

Validation remains part of placement, evaluation, and the arrangement process. The user explicitly requested that validator results stay out of the UI.

## Approved visual scope

The user asked for a memorable retro arcade game in the labs.gt color scheme (yellow, black, orange, white, warm grays; no purple) that makes the purpose obvious: make T-shirts, take each one apart into its pattern pieces, then arrange the pieces on the roll. The whole game must fit a 16:9 laptop screen.

The build tells that story with an intro in which the T-shirt comes apart and its pieces fly into the piece bank, fighting-game style call-outs, a five-step header rail (Playeras › Piezas › Tu tendido › TelaTetris › Ahorro), order cards whose shirt icons empty as pieces are placed, a size × piece matrix, "playera lista" celebrations, and optional chiptune sounds. Press Start 2P supplies display text; IBM Plex Mono supplies body text and canvas measurements. Both fonts are self-hosted with their SIL Open Font License files in `connectors/telatetris/fonts/`. Styling rules live in [DESIGN.md](DESIGN.md).

This document records the known demo and approved styling scope. The repository describes the project as a proof of concept; no additional audience or brand commitments are established here.
