# TelaTetris: the demo

Open `index.html` in a browser. There's no build step or server. The game works offline, including its bundled Press Start 2P and IBM Plex Mono fonts.

## Record human scores in Instabloom

The temporary hosted game is at https://supple-arbor-5msw.here.now/. It expires on November 22, 2026 at 19:57 UTC unless claimed. The deployed copy currently omits the ingestion token because publication of that credential was rejected by automatic approval review. The local token configuration is unchanged. Instabloom must allow `https://supple-arbor-5msw.here.now` as a browser origin; its current POST and GET preflights return 401 without CORS permission headers.

Open `index.html` directly in Chrome. No Node process, build, or local relay is needed. In `score-events.js`, set the `INGESTION_TOKEN` constant near the top to this instance's short-lived ingestion token, then reload the game. This temporary instance intentionally includes its token in the browser source, as requested. The destination is the staging TelaTetris campaign in the `open2 - build and pitch` workspace.

The game records one event when the human layout becomes final and TelaTetris starts its turn. Undo during the review does not record a score. Timeout completion and "Completar por estantes" use the final human layout including any shelf-filled pieces. The only data field is `score_cm`, the human fabric roll length in integer centimeters, sent as a decimal string. Lower is better. No algorithm score, participant name, or image is sent.

Opening an HTML file from disk sends the origin `null`. Instabloom must allow that exact origin for this connection, answer unauthenticated OPTIONS preflights successfully, allow GET and POST with Authorization, Content-Type and Idempotency-Key, and expose Retry-After to the browser. A browser preflight never includes the ingestion token. The current staging endpoint returns 401 without CORS permission headers for `Origin: null`, and the connection shows no browser origins configured. Until that server configuration changes, the game queues scores but Chrome blocks their transmission. Adding a token alone does not fix this.

After configuring CORS and the token, run `await TelaTetrisScores.validate()` in Chrome's developer console. This sends a separate synthetic `120` cm example to `/validate`. It never resets or advances the real delivery queue, reserves nothing, and does not prove delivery. A blank token keeps delivery paused.

Delivery uses these fixed staging resources:

| Resource | ID |
|---|---|
| Workspace | `01a1ff84-784e-75bc-9fa9-6284885c72bc` |
| Campaign | `01a1ff84-cba6-7425-a611-df6983cbbdf7` |
| Connection | `01a1ff88-2df5-74dc-857e-fbb99d724099` |
| Human scores schema v1 | `01a1ff86-6346-7691-95f6-ca500215545f` |

The browser first saves each result synchronously under its own localStorage key, then transfers it into the `telatetris-instabloom-v2` IndexedDB database. IndexedDB transactions allocate a stable queue UUIDv7 and consecutive string sequences even across multiple tabs. Each event has its own batch UUIDv7. The saved batch body is replayed byte for byte after uncertain failures, with its batch ID as the `Idempotency-Key`.

Keep Chrome's site data and use the same browser profile and game file location. Clearing storage, private browsing cleanup, or moving to a different origin can lose access to the queue. Do not reset storage to test setup. Pending source events from the previous browser outbox are imported with their original IDs and timestamps. The removed Node relay is no longer part of the setup.

After an uncertain attempt, the sender looks up the original receipt with the current token, or replays the original saved request. A cloud receipt must match the batch, queue, event, and sequence. The receipt and delivery state commit in one IndexedDB transaction before the sender advances. Network and CORS errors retain the event. Rate limits and temporary errors retry with jitter up to five minutes, or longer when required by `Retry-After`. A 401 keeps the event queued for replacement credentials. Rejections and identity conflicts retain the event and stop later sequences for investigation.

Run `await TelaTetrisScores.status()` in the developer console to inspect pending, delivered, or blocked results and saved receipts. The queue never stores the token. To rotate the token, update the constant and reload the same game file without clearing storage. Browser storage failures warn in the console and do not interrupt play. Offline scores retry when the page reopens or connectivity returns.

The game shows both steps of the engine. Purchasing: every layout's roll length is converted to yards of fabric to buy and their price in quetzales (GTQ). Cutting: the layout on the roll is where each piece would be cut. The result screen leads with the money the engine's layout saves on the purchase.

TelaTetris is the name and brand of the demo. Underneath, it is a connector for the [Arrange engine](../../README.md), and the game's opponent, called TelaTetris on screen, is the engine. The domain is T-shirt pieces on a fabric roll, in cm, on 1 cm cells. Pieces turn in quarter turns, clockwise: 0°, 90°, 180°, 270°. The player and the engine get the same four rotations, so their layouts are compared by the same rules.

## How a round goes

0. **Start screen.** A pixel T-shirt floats and turns above "Empieza a ahorrar con TelaTetris" and an "Empezar" button (or Space/Enter).
1. **Intro (about 7 s).** The order card's T-shirt rises onto the stage, comes apart into its six pieces, and the pieces fly into the piece bank, whose tiles pop in as they land. Then "¿LISTOS? ¡YA!" and the round begins. Any click or Space, Enter, or Escape skips it. Add `?intro=0` to the URL to skip the start screen and the intro; the "¿Cómo?" button replays it before a round starts.
2. **Your turn (1:30).** Pieces arrive in a queue. Place them on a 150 cm roll. The cut line and the waste update live. The clock starts on the first interaction. It turns orange at 15 s, and a warning appears at 10 s. When time runs out, the remaining pieces are laid out in shelves after your cut line, so the comparison always covers the full order, and "¡Se acabó el tiempo!" shows before TelaTetris's turn.
3. **Your result.** When the last piece is placed, your roll length, the yards to buy and their cost show for 3.5 s. The algorithm searches in the background meanwhile. Undo (or clicking a piece) cancels this and returns you to your turn. The button or Enter skips the countdown.
4. **TelaTetris's turn.** Your own pieces fly one by one, on the same roll, to where the algorithm puts them.
5. **Result.** Money saved in GTQ: the cost of the fabric your layout needs minus the cost of TelaTetris's, plus the yards saved, the saving over 1,000 identical orders and per T-shirt. A table compares yards to buy and cost for you, TelaTetris and the shelf layout. Both layouts are validated internally.

## Controls

The whole game can be played from the keyboard.

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Start (start screen) | Empezar | Space / Enter |
| Skip the intro | click | Space / Enter / Esc |
| Move piece | move / drag | arrows (Shift = 5 cm) |
| Place | click / release | Enter |
| Slide to the start of the roll and place | n/a | Space |
| Rotate 90° clockwise | right-click, wheel (one turn per notch), button | R |
| Pick a piece type (press again for the next size) | click a bank tile | 1 Delantero · 2 Espalda · 3 Manga · 4 Cuello · 5 Bolsillo |
| Next piece | click a bank tile | C |
| Pick up a placed piece | click it | Z picks up the last one |
| Undo | button | Z / Backspace |
| Skip the review countdown | button | Enter |
| Skip TelaTetris's rearrangement | n/a | Enter / Space |
| Play again | Jugar otra vez | Enter / Space |
| Sound on / off | header button | M |
| Replay the intro | ¿Cómo? | H |

Buttons work with Tab and Enter/Space too: while a button has keyboard focus it keeps Enter and Space, and Esc hands the keyboard back to the board. The order steppers keep focus when the order changes. After a mouse click a button gives up focus, so Space and Enter go straight back to the game.

"Completar por estantes" lays out every remaining piece in shelves, which is how small factories often do it by hand. Use it when there's no time for a juror to place every piece.

## How it uses the engine

- `garments.js` turns the order on screen into a protocol request (`Garments.request(counts)`). Each piece is an item keyed `<piece>-<size>-<garment>`, with its name and color in `data`.
- `game.js` opens `Arrange.session(request)` when the order changes. While you play, it uses `session.problem` for live checks: does the piece fit here, where does Space slide it, lay the rest out by shelves.
- During the 3.5 s review it calls `session.step(20)` between frames, then `session.result()` for the engine's layout.
- `Garments.purchase(length)` turns each response's `length` (cm of roll) into `{ yards, gtq }`. That's the purchasing step.
- Your layout is scored with `session.evaluate(...)`, by the same rules and in the same response format as the engine's. Both responses still check bounds, overlaps, allowed rotations, and completeness. The results screen shows the comparison without a validator panel.

## Files

- `garments.js`: the connector proper. Piece outlines, sizes, `request(counts)`, which turns an order into a protocol request, and `purchase(length)`, which turns a roll length into yards and GTQ.
- `game.js`: game state, input, canvas drawing, the start screen, the intro, and the sound effects.
- `index.html`: layout and styles. Loads `../../arrange/arrange.js`, `garments.js`, `score-events.js`, and `game.js`.
- `score-events.js`: this instance's token configuration, browser queue, receipt storage, direct ingestion, and synthetic validation.
- `fonts/`: self-hosted retro fonts and their license files. Colors follow labs.gt: yellow, orange, black, white, and warm grays.

## Things you can tune

- `game.js`: `TURN_MS` (time limit, 90 s), `ROLL_W` (roll width), `GAP` (cutting gap in cm), `REVIEW_MS` (how long your result shows; it's also the search time), `MOVE_MS` / `MOVE_TOTAL_MS` (animation).
- `garments.js`: `PIECE_TYPES` (outlines in cm), `GARMENT` (pieces per garment), `SIZE_SCALE`, `PRICE_PER_YARD_GTQ` (demo price of one linear yard of the 150 cm roll, Q30).
  Replace these with real patterns (for example, polygons exported from DXF) to show a factory its own order.
