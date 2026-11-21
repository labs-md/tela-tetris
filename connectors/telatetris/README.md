# TelaTetris: the demo

Open `index.html` in a browser. There's no build step and no server, and it works offline (if Google Fonts can't load, the page falls back to system fonts).

TelaTetris is the name and brand of the demo. Underneath, it is a connector for the [Arrange engine](../../README.md), and the game's opponent, called TelaTetris on screen, is the engine. The domain is T-shirt pieces on a fabric roll, in cm, on 1 cm cells, with rotations limited to 0° and 180° so the grain line stays along the roll.

## How a round goes

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

## How it uses the engine

- `garments.js` turns the order on screen into a protocol request (`Garments.request(counts)`). Each piece is an item keyed `<piece>-<size>-<garment>`, with its name and color in `data`.
- `game.js` opens `Arrange.session(request)` when the order changes. While you play, it uses `session.problem` for live checks: does the piece fit here, where does Space slide it, lay the rest out by shelves.
- During the 3.5 s review it calls `session.step(20)` between frames, then `session.result()` for the engine's layout.
- Your layout is scored with `session.evaluate(...)`, by the same rules and in the same response format as the engine's. The results table and the three checks come straight from those two responses.

## Files

- `garments.js`: the connector proper. Piece outlines, sizes, and `request(counts)`, which turns an order into a protocol request.
- `game.js`: game state, input, canvas drawing.
- `index.html`: layout and styles. Loads `../../arrange/arrange.js`, then `garments.js`, then `game.js`.

## Things you can tune

- `game.js`: `TURN_MS` (time limit, 90 s), `ROLL_W` (roll width), `GAP` (cutting gap in cm), `REVIEW_MS` (how long your result shows; it's also the search time), `MOVE_MS` / `MOVE_TOTAL_MS` (animation).
- `garments.js`: `PIECE_TYPES` (outlines in cm), `GARMENT` (pieces per garment), `SIZE_SCALE`.
  Replace these with real patterns (for example, polygons exported from DXF) to show a factory its own order.
