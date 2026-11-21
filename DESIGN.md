---
name: TelaTetris
description: Retro arcade styling in the labs.gt palette, telling the story playera → piezas → rollo.
colors:
  yellow: "#E8FB5B"
  orange: "#F95300"
  black: "#1C1C1B"
  white: "#FFFFFF"
  olive: "#3B3D2B"
  warm: "#46423F"
  bg: "#1C1C1B"
  panel: "#242420"
  panel-2: "#2E2D29"
  line: "#3D3C36"
  text: "#FFFFFF"
  muted: "#CFCFCD"
  dim: "#8F8C85"
  bevel-light: "#5C5A53"
  bevel-dark: "#121211"
  piece-front: "#E8FB5B"
  piece-back: "#C6D64C"
  piece-sleeve: "#F3FCA8"
  piece-collar: "#FFFFFF"
  piece-pocket: "#F95300"
typography:
  display:
    fontFamily: '"Press Start 2P", monospace'
    fontWeight: 400
  pixel-label:
    fontFamily: '"Press Start 2P", monospace'
    fontSize: "11px"
    fontWeight: 400
  body:
    fontFamily: '"IBM Plex Mono", monospace'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: '"Press Start 2P", monospace'
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  square: "0"
spacing:
  compact: "8px"
  small: "12px"
  regular: "16px"
  section: "24px"
  shell: "28px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "#151515"
    typography: "{typography.pixel-label}"
    rounded: "{rounded.square}"
    padding: "14px"
  button-secondary:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.square}"
    padding: "11px 12px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.square}"
    padding: "{spacing.regular}"
  queue-tile:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.square}"
    padding: "18px 4px 6px"
  stat:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.yellow}"
    rounded: "{rounded.square}"
    padding: "12px 10px"
---

# Design System: TelaTetris

## Overview

**Creative North Star: "An arcade cabinet that shows how a T-shirt becomes fabric savings"**

The demo tells one story, left to right and in order: an order of T-shirts (playeras), each shirt taken apart into its six pattern pieces (piezas), the pieces laid on the roll (tendido), TelaTetris rearranging them, and the money saved on the fabric purchase (ahorro, in quetzales). Pixel headings, score numbers, square beveled controls, and faint scanlines give the arcade feel. Colors come from labs.gt.

Garment shapes retain their actual outlines. The cloth roll, ruler, cutting lines, and piece quantities make the arrangement readable throughout play and comparison. Retro styling belongs to the interface around those measurements.

**Key Characteristics:**

- An intro journey through the real interface: the order's T-shirt rises to the stage, comes apart, and its pieces fly into the piece bank before "¿LISTOS? ¡YA!".
- Fighting-game style call-outs for the big moments.
- A five-step rail in the header: Playeras › Piezas › Tu tendido › TelaTetris › Ahorro.
- Pixel display text paired with monospace instructions and measurements.
- Labs yellow and orange on warm black, with olive and warm gray as supporting darks. No purple.
- Square panels, arcade bevels, offset "slab" shadows, and visible selection borders.
- The whole game fits one 16:9 laptop screen without scrolling.

The evidence is `connectors/telatetris/index.html`, `game.js`, and `garments.js`. This system applies to the TelaTetris connector, not other Arrange connectors.

## Colors

The palette is the one labs.gt uses: yellow `#E8FB5B`, black `#1C1C1B`, orange `#F95300`, and white, with the site's warm grays (`#CFCFCD`, `#46423F`) and olive (`#3B3D2B`). The frontmatter owns exact values.

### Primary

- **Labs yellow** marks the brand, the active rail step, primary actions, statistics, TelaTetris's cut line, and the money-saved box on the roll. The result card is a full yellow slab with black text, as labs.gt uses its yellow sections.
- **The T-shirt is yellow.** Front is Labs yellow, back a darker yellow, sleeves a lighter yellow, so the pieces read as one garment.

### Secondary

- **Labs orange** marks the player's cut, low time, the "your layout" banner (an orange slab), invalid placements (orange dashed outline over a dark fill with a ✕), and the pocket. Orange hatching marks unused cloth.

### Neutral

- **Warm black** anchors the page; panel and control darks layer on it.
- **Olive** backs completed rail steps and the selected piece tile, and draws grain arrows.
- **White** carries primary text and the collar rib. Light gray carries secondary text; dim gray carries tertiary text and empty outlines.

**The Same Piece Color Rule.** Keep each garment type's fill consistent between its queue preview and the board. Orange may override the fill to show an invalid placement.

## Typography

**Display Font:** Press Start 2P, with a monospace fallback.

**Body Font:** IBM Plex Mono, with a monospace fallback. Canvas text uses the same body stack.

Both families load from local font files, with their license files beside them. The pixel face is regular weight. The body family has regular and bold files.

### Hierarchy

- The brand scales from 18px to 26px with a 1.5 line height. Stage headings use 18px with a 1.7 line height and can wrap on mobile.
- Section headings and primary actions use the pixel-label role. Headings use a 1.7 line height; primary actions use 1.8.
- Repeated statistics use the metric role. The result enlarges the money saved (Q, two decimals) to make the outcome dominant.
- Body copy and controls use the body family. Supporting copy steps down to 13px or 12px; queue labels and compact metric labels use 11px.
- Queue quantities use 10px pixel text. Canvas cut labels use bold 12px monospace; rulers use 11px monospace. Numbers use tabular figures where the UI compares changing values.

**The Pixel Hierarchy Rule.** Use the pixel family for headings, primary actions, counts, and scores. Keep instructions, garment names, table values, units, and canvas measurements in IBM Plex Mono.

## Layout

At 981px and wider with at least 560px of height, the app is exactly one viewport tall and never scrolls: header, then a two-column grid of a 352px aside (316px below 1240px) and the stage. The canvas fills whatever height the stage leaves it. Below 720px of height, card padding, tile height, and the stage subtitle shrink or hide.

- **Header:** pixel shirt icon and logo with an orange offset shadow, the five-step rail, and the intro and sound toggles.
- **Aside, top to bottom:** "1 El pedido" (one card per size with a shirt icon drawn to scale and a stepper), a dashed divider reading "cada playera se desarma en 6 piezas", "2 Las piezas" (a size × piece matrix of tiles), and the action buttons. During the rearrangement and the result, the aside shows the solve and result panels instead.
- **Stage:** title and HUD (time, pieces, roll, waste), the roll canvas, and a one-line key legend.

At 980px and below the layout stacks with the stage first, the HUD spans the width, and the canvas height follows its width.

The order card's shirt icons are built from the real pattern pieces. A piece type still waiting to be placed is filled; once all of that type are on the roll it becomes a dashed outline, so each shirt visibly empties onto the roll.

## Elevation & Depth

Depth comes from charcoal layers and directional bevel borders. The board uses a heavy 6px bevel; action buttons use 3px bevels and size controls use 2px bevels. Top and left edges are lighter, bottom and right edges darker. Pressing an enabled control reverses its bevel. Cards have flat borders without ambient shadows.

Moving garments briefly receive a soft canvas shadow with 16px blur and a 6px downward offset. It marks movement during rearrangement, not a resting card style.

**The Arcade Bevel Rule.** Use opposing light and dark borders for board and control depth; reverse the control bevel on press.

## Shapes

Panels, buttons, queue tiles, progress bars, badges, and toasts have square corners. Most container borders are 2px. Keyboard keys have a thicker lower edge. Garment silhouettes come directly from their polygon geometry, including grain arrows where applicable, which turn with the piece (vertical after a quarter turn); their outline stays intact under the retro styling.

## Components

### Buttons

Primary actions use yellow, dark text, pixel labels, and a yellow bevel. Their hover fill brightens. Secondary actions use the lighter control charcoal, bold body text, and a neutral bevel. Enabled controls reverse the bevel when pressed. Disabled actions reduce opacity to 0.4; disabled size buttons use 0.35. Keyboard focus has a yellow 2px outline with a 4px offset.

### Size controls

Each size card contains a shirt icon drawn to scale (S smallest, XL largest), the size name, a decrement button, a tabular count, and an increment button. The controls retain their bevel, hover fill, disabled treatment, and keyboard focus. Mobile dimensions follow Layout.

### Queue tiles

Tiles sit in a matrix with one row per size and one column per piece type, named once in the header row under its number key (1–5) in yellow pixel text. Each tile shows the real garment silhouette and a remaining quantity at the top right; the piece-and-size name is a screen-reader label. Selection turns the border yellow and the fill olive. Selection uses `aria-pressed`, and the accessible label includes the remaining quantity. Exhausted groups disable with reduced opacity. Counts include the held piece. Queue focus uses the shared yellow outline with a 3px offset.

### Cards and statistics

Cards use panel charcoal, square divider borders, and white pixel headings led by a numbered yellow chip that matches the rail. Statistics sit in darker inset blocks. Their values use yellow pixel numbers with smaller muted monospace units. Low time changes to orange and uses a stepped blink.

### Board and results

The beveled canvas frame contains the cloth grid, real garment outlines, ruler, and labeled cut lines. Yellow and orange distinguish algorithm and player comparison marks. On the result the savings are the only message. The app enters a result mode that hides the side panel, HUD stats, stage heading and key legend, so the stage runs full width. A savings banner takes about 55% of its height: a yellow slab (orange when the player wins) with "En 1,000 compras como esta, TelaTetris te ahorra", the 1,000-purchase amount in the largest pixel type on screen (counting up, shrunk to fit), and a single line with this purchase's saving and yards; a black side with two fabric-cost bars (player orange, TelaTetris yellow), the price per yard, and the "Jugar otra vez" button. The board takes the remaining height at 85% opacity, showing TelaTetris's layout with the saved stretch labeled in yards ("menos tela").

The completed demo also offers a primary yellow "Ir a la plataforma" link to the materials planner in the same tab. "Jugar otra vez" sits beneath it as a secondary button and retains its Enter shortcut. Both fit within the result banner; on narrow screens the banner stacks its savings and actions. Supporting notes use at least 12px text; the start-screen hint uses the muted foreground to maintain contrast over its background.

### Start screen

A full-screen title card on warm black with the Labs dot grid: the pixel shirt and TelaTetris wordmark, a canvas T-shirt that floats, turns around its vertical axis (showing the back panel when it faces away, darker as it turns edge-on) and casts a floor shadow, pixel twinkles, the title "Empieza a ahorrar con TelaTetris" slamming in with an orange offset shadow, a line about yards and quetzales, and a throbbing yellow "▶ Empezar" button. The shirt is drawn at quarter resolution and scaled up without smoothing, so it reads as pixel art. Space or Enter also starts.

### Story

Between the start screen and the intro, a full-screen cutscene in the style of a top-down adventure game, original art only. Scenes are drawn at 192×108 and scaled up without smoothing, in the Labs palette plus a skin tone and a brown for wood: Chepe's workshop (an order card with shirt icons pops up as a letter flies in), the town map (a path from the orange-roofed TALLER to the yellow-roofed TELAS shop, round yellow trees, a shirt "inventory" in the corner, Chepe walking), and the fabric shop (shelves of rolls, a 150 cm roll on the counter, Doña Rosa behind it). When she asks how many yards, Chepe shakes and question marks in yellow, orange and white bob over his head.

Dialogue sits in a classic RPG box: black, white border, yellow outer ring, a yellow name tag for the speaker (none for the narrator, whose text is gray), pixel text typed at about 30 characters per second with soft blips, and a blinking ▼ when the line is complete. The player advances every line. Two beveled buttons sit at the top right for pitches: "Saltar historia" (Esc or Start) goes on to the intro, and the yellow primary "Ir al juego ▸▸" (J or Select) jumps straight into the round with a short "¡YA!".

### Intro

The intro plays on load (skip with `?intro=0`) and again from the "¿Cómo?" button before a round starts. It runs on a full-screen overlay above the real interface and dims everything but the part in focus, outlined with a moving dashed yellow border:

1. The order card is in focus and the largest size's card pulses. Its T-shirt rises out of the card to the middle of the stage.
2. The shirt bursts into its six pieces, sleeves unfolding. The pieces carry no labels; the call-out names them.
3. The piece bank is in focus. Each piece flies in an arc into its tile, and the tile pops in when the piece lands. Then the rest of the bank cascades in.
4. The roll is in focus: "Acomódalas en el rollo".
5. The **Controles** card slams in (yellow border, orange offset shadow) with two columns, "Teclado y mouse" and "Control", whose rows slide in one after another. The column for the input in use has a yellow border; the controller column says "✓ Control conectado" once a controller is pressed. The journey pauses on it until "OK · ¡A jugar!" (Enter, Space, click, A or Start).
6. "¿LISTOS?" and "¡YA!", and the round starts.

Pacing is set for reading: captions hold 2–2.6 s and type their subline over 0.75 s; the shirt flies for 1 s, bursts over 0.8 s, and pieces land 0.15 s apart over 0.9 s each. In-game call-outs hold 1.4–2.4 s, the review lasts 4.5 s and the rearrangement about 4.3 s.

Any click, Space, Enter, Escape or controller button skips ahead to the Controles card; it is never skipped, except with `?intro=0`.

### Call-outs

Fighting-game style announcer text draws on the same overlay, in Press Start 2P, sheared like italics, with a thick black outline, an offset drop layer, and a white-to-color gloss. Words zoom in from about 3× size, shake and flash white on impact, then leave. Captions sit on a slanted black band that slides across the stage, with a typewriter subline. Big call-outs fill the stage center; "¡YA!", "¡AHORRO!" and "¡GANASTE!" add a radial burst. Small pops rise from a point on the board.

Call-outs: the intro captions, ¡10 SEGUNDOS!, ¡TIEMPO!, ¡COMPLETO!, TURNO DE TELATETRIS, ¡AHORRO! / ¡EMPATE! / ¡GANASTE!, and ¡PLAYERA M! when a T-shirt's pieces are all on the roll.

### Key legend

The one-line legend under the board shows keyboard keys by default and switches to controller buttons (✚/stick, A, X, R1/R2, L1/L2, Y, B) once a controller is pressed, using the same `kbd` key caps.

### Motion and feedback

A placed piece flashes white. Completing every piece of a T-shirt pops "¡PLAYERA M!" and plays an arpeggio. Short square-wave sounds mark placing, rotating, invalid drops, the last ten seconds, the countdown, each piece's flight, and the result; M or the header button mutes them, and the choice is remembered. Toasts fade over 0.15 seconds. The low-time statistic blinks over 1 second in two steps. Piece movement belongs to the rearrangement sequence. The reduced-motion media query disables CSS animation and transitions; it does not control the existing canvas rearrangement.

## Do's and Don'ts

### Do:

- **Do** keep the labs.gt palette: yellow, orange, black, white, and the warm grays and olive.
- **Do** keep the playera → piezas → rollo story visible: the rail, the shirt icons, and the intro.
- **Do** pair pixel headings and scores with monospace explanations and measurements.
- **Do** retain square corners, directional bevels, yellow keyboard focus, and visible queue selection.
- **Do** preserve readable cut labels on separate rows when the canvas is narrow.

### Don't:

- **Don't** replace garment outlines with Tetris blocks to communicate the retro style.
- **Don't** expose the validator or its check results in the interface; validation remains internal.
- **Don't** reintroduce purple or other colors outside the labs.gt palette.
- **Don't** let the desktop layout scroll; fit content to one 16:9 screen.
