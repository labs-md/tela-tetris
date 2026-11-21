# TelaTetris: demo game

Open `index.html` in a browser. There's no build step and no server, and it works offline (if Google Fonts can't load, the page falls back to system fonts).

The game is one use case of the [Arrange engine](../arrange/README.md): T-shirt pieces on a fabric roll, 1 cm cells, rotations limited to 0° and 180° so the grain line stays along the roll.

1. **Your turn (1:30).** Pieces arrive in a queue. Place them on a 150 cm roll. The cut line and the waste update live. The clock starts on the first interaction. It turns orange at 15 s, and a warning appears at 10 s. When time runs out, the remaining pieces are laid out in shelves after your cut line, so the comparison always covers the full order, and "¡Se acabó el tiempo!" shows before TelaTetris's turn.
2. **Your result.** When the last piece is placed, your roll length shows for 3.5 s. The algorithm searches in the background meanwhile. Undo (or clicking a piece) cancels this and returns you to your turn. The button or Enter skips the countdown.
3. **TelaTetris's turn.** Your own pieces fly one by one, on the same roll, to where the algorithm puts them.
4. **Result.** Roll saved (the gap between your cut line and TelaTetris's), fabric use compared with the shelf baseline, and the validator.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Move piece | move / drag | arrows (Shift = 5 cm) |
| Place | click / release | Enter |
| Slide to the start of the roll and place | n/a | Space |
| Rotate 180° | right-click, wheel, button | R |
| Next piece | click a queue tile | C |
| Pick up a placed piece | click it | n/a |
| Undo | button | Z / Backspace |

"Completar por estantes" lays out every remaining piece in shelves, which is how small factories often do it by hand. Use it when there's no time for a juror to place every piece.

## Files

- `garments.js`: the fabric use case. Piece outlines, sizes, and `createOrder(counts)`, which turns an order into an Arrange problem.
- `game.js`: game state, input, canvas drawing.
- `index.html`: layout and styles. Loads `../arrange/arrange.js`, then `garments.js`, then `game.js`.

## Things you can tune

- `game.js`: `TURN_MS` (time limit, 90 s), `ROLL_W` (roll width), `GAP` (cutting gap in cm), `REVIEW_MS` (how long your result shows; it's also the search time), `MOVE_MS` / `MOVE_TOTAL_MS` (animation).
- `garments.js`: `PIECE_TYPES` (outlines in cm), `GARMENT` (pieces per garment), `SIZE_SCALE`.
  Replace these with real patterns (for example, polygons exported from DXF) to show a factory its own order.
