# TelaTetris: the demo

Open `index.html` in a browser. There's no build step or server. The game works offline, including its bundled Press Start 2P and IBM Plex Mono fonts.

## Unified pitch demo

After a completed round, choose **Ir a la plataforma** to open the fabric and wood planner in the same tab. **Jugar otra vez** remains available. The handoff works from the repository's game page as well as the packaged demo.

Run `npm run build:demo` from the repository root to create `dist/demo/`. Publish that folder to give the pitch one link: the game opens at `/`, and the button leads to `/planner/index.html`. The build includes the engine, planner, fonts and licenses, rewrites the two relative paths for this layout, and versions game scripts by their content hashes. It omits vendor source and deployment files, and includes this demo's short-lived ingestion token so human scores send without a setup screen. `/connect.html` can replace the token for the current tab after it expires.

## Record human scores in Instabloom

The hosted game is at https://zippy-tassel-p83t.here.now/. The unclaimed site expires on November 23, 2026 at 17:51 UTC. Its embedded ingestion token expires on November 23 at 17:48 UTC, or 11:48 a.m. Guatemala time. Play needs no token entry. The campaign is [telatetris post](https://stg.lid.gt/workspaces/01a1ff84-784e-75bc-9fa9-6284885c72bc/campaigns/01a2045e-05f0-712b-91f6-e8860a376163) in `open2 - build and pitch`.

The game records one event when the human layout becomes final and TelaTetris starts its turn. Undo during the review records nothing. Timeout completion and "Completar por estantes" use the final human layout including shelf-filled pieces. The required `score_cm` field is the human fabric roll length in integer centimeters, sent as a decimal string. Lower is better. No algorithm score, participant name, or image is sent.

| Resource | ID |
|---|---|
| Workspace | `01a1ff84-784e-75bc-9fa9-6284885c72bc` |
| Campaign | `01a2045e-05f0-712b-91f6-e8860a376163` |
| Human round scores model | `01a2045e-2fca-7f4a-bcca-6a7d2db8cfb1` |
| Schema v1 | `01a2045f-1767-7204-9261-3cf0114a87c7` |
| Browser connection | `01a2045f-a3ea-7022-8e76-4e0dcba7d735` |

The staging ingestion server allows the exact browser origin `https://zippy-tassel-p83t.here.now`. Browser OPTIONS preflights carry no token. Synthetic validation has passed from the hosted page. The allowlist was updated through `dv-wh` on staging host `159.203.87.60` in `/opt/ib-target/ib-target-stg/inputs/ingestion.json`, preserving its bind-mounted inode and 0400 mode. The previous file is saved beside it as `ingestion.json.telatetris-post-20261122.bak`. The API rereads this configuration, so no restart was needed. A hosted test round recorded `score_cm: "360"`; the server accepted it and the browser saved its receipt as delivered. Receipt `01a20466-a5a8-7098-aac8-1122dafca32a` belongs to batch `01a20466-a50f-798d-accf-7d2f434c0c3c`. The client validates the API's receipt ID, batch ID, event ID and sequence. Retries recovered that same score without creating another event.

The browser synchronously saves each result under a `telatetris-score-post:` localStorage key, then transfers it into `telatetris-instabloom-post-v2` IndexedDB. These campaign-specific names preserve the previous campaign's stored queues without sending old scores to the new campaign. Transactions allocate a stable queue UUIDv7 and consecutive string sequences across tabs. Every batch is replayed byte for byte with its UUIDv7 as `Idempotency-Key` after uncertain failures.

Keep the same browser profile and site data. Clearing storage or moving origins can lose access to pending results. Network failures retain the event for retry. Receipt lookup reconciles uncertain sends; a matching cloud receipt and delivery state commit together before the sender advances. Rejections retain the event and stop later sequences. A 401 keeps the score queued for replacement credentials.

Run `await TelaTetrisScores.status()` in the developer console to inspect pending, delivered, or blocked scores and receipts. `await TelaTetrisScores.validate()` checks a separate synthetic `120` cm example without storing a score or changing the delivery queue. To rotate the token, replace the constant in `score-events.js` and rebuild, or open `/connect.html` to override it for the current tab. The queue never stores the token. Browser storage failures warn in the console and do not interrupt play.

The game shows both steps of the engine. Purchasing: every layout's roll length is converted to yards of fabric to buy and their price in quetzales (GTQ). Cutting: the layout on the roll is where each piece would be cut. The result screen leads with the money the engine's layout saves on the purchase.

TelaTetris is the name and brand of the demo. Underneath, it is a connector for the [Arrange engine](../../README.md), and the game's opponent, called TelaTetris on screen, is the engine. The domain is T-shirt pieces on a fabric roll, in cm, on 1 cm cells. Pieces turn in quarter turns, clockwise: 0°, 90°, 180°, 270°. The player and the engine get the same four rotations, so their layouts are compared by the same rules.

## How a round goes

0. **Start screen.** A pixel T-shirt floats and turns above "Empieza a ahorrar con TelaTetris" and an "Empezar" button (or Space/Enter).
1. **Story.** Right after Empezar, a short pixel-art cutscene in the style of a top-down adventure game makes the problem concrete. Chepe, a tailor, receives an order for the T-shirts on screen (4 by default), crosses town to the fabric shop, and Doña Rosa asks "¿Cuántas yardas le corto?". Chepe doesn't know: question marks, a sweat drop, and the line "¡Ayuda a Chepe a saber cuánta tela comprar!". Each line types out and waits for Enter, Space, a click or any controller button. Two skips for pitches, top right: **Saltar historia** (Esc, or Start on a controller) goes on to the intro, and **Ir al juego** (J, or Select) skips the story, the intro and the controls screen straight into the round. `?story=0` in the URL skips just the story. "¿Cómo?" (H) replays it.
2. **Intro (about 10 s, paced for reading).** The order card's T-shirt rises onto the stage, comes apart into its six pieces, and the pieces fly into the piece bank, whose tiles pop in as they land. Then the **Controles** screen shows the keyboard and controller controls side by side, with the controller column highlighted once one is connected, and waits for **OK** (Enter, Space, a click, or A/Start). "¿LISTOS? ¡YA!" follows and the round begins. Skipping (a click, Space, Enter, Esc or any controller button) jumps to the controls screen, not past it. Add `?intro=0` to the URL to skip the start screen, the story and the intro; the "¿Cómo?" button replays it before a round starts.
3. **Your turn (1:30).** Pieces arrive in a queue. Place them on a 150 cm roll. The cut line and the waste update live. The clock starts on the first interaction. It turns orange at 15 s, and a warning appears at 10 s. When time runs out, the remaining pieces are laid out in shelves after your cut line, so the comparison always covers the full order, and "¡Se acabó el tiempo!" shows before TelaTetris's turn.
4. **Your result.** When the last piece is placed, your roll length, the yards to buy and their cost show for 4.5 s. The algorithm searches in the background meanwhile. Undo (or clicking a piece) cancels this and returns you to your turn. The button or Enter skips the countdown.
5. **TelaTetris's turn.** Your own pieces fly one by one, on the same roll, to where the algorithm puts them.
6. **Result.** One message: the savings at scale. Everything else steps aside (side panel, HUD stats, stage title and key legend are hidden). A banner takes the larger share of the stage with "En 1,000 compras como esta, TelaTetris te ahorra" and the amount in large type, counting up, then one line with this purchase's saving and the yards saved. Beside it, two bars compare the fabric cost of your layout and TelaTetris's, and "Jugar otra vez" (Enter). TelaTetris's layout stays below, smaller and slightly dimmed, with the saved stretch of roll marked in yards. Both layouts are validated internally.

## Controls

The whole game can be played from the keyboard or a game controller.

| Action | Mouse / touch | Keyboard | Controller |
|---|---|---|---|
| Start (start screen) | Empezar | Space / Enter | any button |
| Skip the intro | click | Space / Enter / Esc | any button |
| Move piece | move / drag | arrows (Shift = 5 cm) | D-pad (1 cm, repeats while held, 3 cm after a second) or left stick (faster the further you push) |
| Place | click / release | Enter | A / ✕ |
| Slide to the start of the roll and place | n/a | Space | X / □ |
| Rotate 90° clockwise | right-click, wheel (one turn per notch), button | R | R1 or R2 |
| Pick a piece type (press again for the next size) | click a bank tile | 1 Delantero · 2 Espalda · 3 Manga · 4 Cuello · 5 Bolsillo | L1 next type, L2 previous type |
| Next piece | click a bank tile | C | Y / △ |
| Pick up a placed piece | click it | Z picks up the last one | B / ○ picks up the last one |
| Undo | button | Z / Backspace | B / ○ |
| Skip the review countdown | button | Enter | A or Start |
| Skip TelaTetris's rearrangement | n/a | Enter / Space | any button |
| Play again | Jugar otra vez | Enter / Space | A or Start |
| Sound on / off | header button | M | Select / Share |
| Replay the intro | ¿Cómo? | H | n/a |

Controllers use the browser Gamepad API with the standard layout, so Xbox, PlayStation and Switch Pro controllers work over USB or Bluetooth. Browsers only report a controller after one of its buttons is pressed; the first press on the start screen does that and starts the game. Once a controller is in use, the key legend under the board shows its buttons, and controllers that support it rumble on placements, bad drops and finished T-shirts.

Buttons work with Tab and Enter/Space too: while a button has keyboard focus it keeps Enter and Space, and Esc hands the keyboard back to the board. The order steppers keep focus when the order changes. After a mouse click a button gives up focus, so Space and Enter go straight back to the game.

"Completar por estantes" lays out every remaining piece in shelves, which is how small factories often do it by hand. Use it when there's no time for a juror to place every piece.

## How it uses the engine

- `garments.js` turns the order on screen into a protocol request (`Garments.request(counts)`). Each piece is an item keyed `<piece>-<size>-<garment>`, with its name and color in `data`.
- `game.js` opens `Arrange.session(request)` when the order changes. While you play, it uses `session.problem` for live checks: does the piece fit here, where does Space slide it, lay the rest out by shelves.
- During the 4.5 s review it calls `session.step(20)` between frames, then `session.result()` for the engine's layout.
- `Garments.purchase(length)` turns each response's `length` (cm of roll) into `{ yards, gtq }`. That's the purchasing step.
- Your layout is scored with `session.evaluate(...)`, by the same rules and in the same response format as the engine's. Both responses still check bounds, overlaps, allowed rotations, and completeness. The results screen shows the comparison without a validator panel.

## Files

- `garments.js`: the connector proper. Piece outlines, sizes, `request(counts)`, which turns an order into a protocol request, and `purchase(length)`, which turns a roll length into yards and GTQ.
- `game.js`: game state, input, canvas drawing, the start screen, the story, the intro, and the sound effects.
- `index.html`: layout and styles. Loads `../../arrange/arrange.js`, `garments.js`, `score-events.js`, and `game.js`.
- `score-events.js`: this instance's token configuration, browser queue, receipt storage, direct ingestion, and synthetic validation.
- `connect.html` and `score-setup.js`: session-only browser token entry for the hosted instance.
- `fonts/`: self-hosted retro fonts and their license files. Colors follow labs.gt: yellow, orange, black, white, and warm grays.

## Things you can tune

- `game.js`: `TURN_MS` (time limit, 90 s), `ROLL_W` (roll width), `GAP` (cutting gap in cm), `REVIEW_MS` (how long your result shows; it's also the search time), `MOVE_MS` / `MOVE_TOTAL_MS` (animation).
- `garments.js`: `PIECE_TYPES` (outlines in cm), `GARMENT` (pieces per garment), `SIZE_SCALE`, `PRICE_PER_YARD_GTQ` (demo price of one linear yard of the 150 cm roll, Q30).
  Replace these with real patterns (for example, polygons exported from DXF) to show a factory its own order.
