/*
 * Arrange: a raster engine for laying out irregular shapes on a strip.
 *
 * The problem it solves: given a strip of fixed width and open length (a roll
 * of fabric, a coil of sheet metal, a glass or wood panel, a page), place a set
 * of polygons so they don't overlap, keep a minimum gap between them and from
 * the edges, and use as little strip length as possible.
 *
 * Everything is a raster of square cells. The engine never knows what a cell
 * measures: the caller picks a cell size and passes geometry in cells. The
 * strip's length runs along x (columns), its width along y (rows), with y
 * pointing down.
 *
 * Placement rules (the same for interactive boards, the shelf baseline, the
 * algorithm and the validator):
 *   - an item's body (cells its outline touches) may not overlap another body
 *     or a blocked cell;
 *   - the body grown by `gap` cells (the "template") must stay on the strip
 *     and may not touch another body or a blocked cell, so items stay `gap`
 *     cells apart and `gap` cells from the edges and from blocked regions.
 *
 * The placement algorithm follows Meng, L. et al., "Optimizing 2D irregular
 * packing via image processing and computational intelligence", Scientific
 * Reports 15, 12320 (2025), doi:10.1038/s41598-025-97202-0 (full citation in
 * the root README): normalized cross-correlation (NCC) between
 * the inverted strip and each item template, a left-hand search window that
 * grows the layout from left to right, and filling of holes too small for the
 * item. On top of the paper's single greedy pass, `search` tries other item
 * orders and keeps the shortest layout.
 *
 * Works as a browser <script> (window.Arrange) and as a Node module.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------- geometry ---

  function polygonArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    }
    return Math.abs(a) / 2;
  }

  function bounds(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  /** Move a polygon so its bounding box starts at (0, 0). */
  function normalizePolygon(poly) {
    const b = bounds(poly);
    return { poly: poly.map(([x, y]) => [x - b.minX, y - b.minY]), w: b.maxX - b.minX, h: b.maxY - b.minY };
  }

  function scalePolygon(poly, sx, sy = sx) {
    return poly.map(([x, y]) => [x * sx, y * sy]);
  }

  /**
   * Rotate by `deg` degrees, clockwise on screen (y points down). Multiples of
   * 90° are exact; other angles go through cos/sin.
   */
  function rotatePolygon(poly, deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d === 0) return poly.map(([x, y]) => [x, y]);
    if (d === 90) return poly.map(([x, y]) => [-y, x]);
    if (d === 180) return poly.map(([x, y]) => [-x, -y]);
    if (d === 270) return poly.map(([x, y]) => [y, -x]);
    const t = (d * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    return poly.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  }

  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Conservative raster of a polygon whose box starts at (0, 0): a cell is set
  // if the outline touches it (sampled 6x6), plus every vertex's cell.
  function rasterize(poly, w, h) {
    const W = Math.max(1, Math.ceil(w - 1e-9)), H = Math.max(1, Math.ceil(h - 1e-9));
    const data = new Uint8Array(W * H);
    const S = 6;
    for (let i = 0; i < H; i++) {
      for (let j = 0; j < W; j++) {
        let hit = false;
        for (let sy = 0; sy < S && !hit; sy++) {
          const py = i + 0.01 + (0.98 * sy) / (S - 1);
          for (let sx = 0; sx < S && !hit; sx++) {
            const px = j + 0.01 + (0.98 * sx) / (S - 1);
            if (pointInPolygon(px, py, poly)) hit = true;
          }
        }
        if (hit) data[i * W + j] = 1;
      }
    }
    for (const [x, y] of poly) {
      const j = Math.min(W - 1, Math.floor(x)), i = Math.min(H - 1, Math.floor(y));
      data[i * W + j] = 1;
    }
    return { data, w: W, h: H };
  }

  // Grow by g cells (Eq. 1 of the paper: dilation with a disk). A cell joins
  // the template when its nearest edge is closer than g to a body cell, so no
  // two bodies end up closer than g, diagonals included. For g = 1 this is
  // the paper's disk; for larger g the paper's disk lets corners get closer.
  function dilate(mask, g) {
    const w = mask.w + 2 * g, h = mask.h + 2 * g;
    const data = new Uint8Array(w * h);
    const reach = [];
    for (let di = -g; di <= g; di++) {
      for (let dj = -g; dj <= g; dj++) {
        const a = Math.max(0, Math.abs(di) - 1), b = Math.max(0, Math.abs(dj) - 1);
        if (a * a + b * b < g * g || (di === 0 && dj === 0)) reach.push(di, dj);
      }
    }
    for (let i = 0; i < mask.h; i++) {
      for (let j = 0; j < mask.w; j++) {
        if (!mask.data[i * mask.w + j]) continue;
        for (let k = 0; k < reach.length; k += 2) data[(i + g + reach[k]) * w + (j + g + reach[k + 1])] = 1;
      }
    }
    return { data, w, h };
  }

  // Row runs [row, from, to) of set cells, flattened.
  function runsOf(mask) {
    const runs = [];
    for (let i = 0; i < mask.h; i++) {
      let j = 0;
      while (j < mask.w) {
        if (!mask.data[i * mask.w + j]) { j++; continue; }
        const a = j;
        while (j < mask.w && mask.data[i * mask.w + j]) j++;
        runs.push(i, a, j);
      }
    }
    return Int32Array.from(runs);
  }

  function count(mask) {
    let n = 0;
    for (let k = 0; k < mask.data.length; k++) n += mask.data[k];
    return n;
  }

  // ------------------------------------------------------------- items ---

  function makeVariant(poly, rot, gap) {
    const { poly: p, w, h } = normalizePolygon(rotatePolygon(poly, rot));
    const body = rasterize(p, w, h);
    const tmpl = dilate(body, gap);
    return {
      rot, poly: p, w, h, body, tmpl,
      bodyRuns: runsOf(body), tmplRuns: runsOf(tmpl),
      nT: count(tmpl),
    };
  }

  /**
   * Turn item specs into rasterized items. Copies of one spec (`quantity`)
   * share their rasters. Item ids are their index in the returned array.
   *
   * spec: { polygon: [[x, y], ...] in cells,
   *         rotations?: degrees allowed, default [0],
   *         quantity?: default 1,
   *         data?: anything; copied onto every item untouched }
   */
  function prepareItems(specs, gap = 0) {
    const items = [];
    for (const spec of specs) {
      if (!spec.polygon || spec.polygon.length < 3) throw new Error('Arrange: every item needs a polygon with 3+ points');
      const rotations = [...new Set((spec.rotations || [0]).map(Number))];
      const { poly, w, h } = normalizePolygon(spec.polygon);
      const variants = rotations.map((r) => makeVariant(poly, r, gap));
      const area = polygonArea(poly);
      const qty = spec.quantity === undefined ? 1 : spec.quantity;
      for (let q = 0; q < qty; q++) {
        items.push({ id: items.length, polygon: poly, w, h, area, rotations, variants, data: spec.data });
      }
    }
    return items;
  }

  function variantOf(item, rot) {
    const vs = item.variants;
    for (let k = 0; k < vs.length; k++) if (vs[k].rot === rot) return vs[k];
    return undefined;
  }

  // ------------------------------------------------------------- board ---

  const BLOCKED = -1;

  /**
   * Occupancy grid for interactive or incremental layouts. `owner` holds
   * item id + 1 for body cells, 0 for free cells and -1 for blocked cells.
   * Coordinates are the body's top-left cell.
   */
  class Board {
    constructor(width, length, gap, blocked = null) {
      this.W = width; this.L = length; this.gap = gap;
      this.owner = new Int16Array(width * length);
      if (blocked) for (let k = 0; k < blocked.length; k++) if (blocked[k]) this.owner[k] = BLOCKED;
    }

    fits(item, rot, x, y, ignoreId = -1) { return this.fitsVariant(variantOf(item, rot), x, y, ignoreId); }

    fitsVariant(v, x, y, ignoreId = -1) {
      const g = this.gap, tx = x - g, ty = y - g;
      if (tx < 0 || ty < 0 || tx + v.tmpl.w > this.L || ty + v.tmpl.h > this.W) return false;
      const r = v.tmplRuns, L = this.L, own = this.owner, ign = ignoreId + 1;
      for (let k = 0; k < r.length; k += 3) {
        const base = (ty + r[k]) * L + tx;
        for (let j = r[k + 1]; j < r[k + 2]; j++) {
          const o = own[base + j];
          if (o !== 0 && o !== ign) return false;
        }
      }
      return true;
    }

    paint(v, x, y, value) {
      const r = v.bodyRuns, L = this.L;
      for (let k = 0; k < r.length; k += 3) {
        const base = (y + r[k]) * L + x;
        for (let j = r[k + 1]; j < r[k + 2]; j++) this.owner[base + j] = value;
      }
    }

    place(item, rot, x, y) { this.paint(variantOf(item, rot), x, y, item.id + 1); }
    remove(item, rot, x, y) { this.paint(variantOf(item, rot), x, y, 0); }

    /** Item id at a cell, -1 if free or off the board, -2 if blocked. */
    ownerAt(x, y) {
      if (x < 0 || y < 0 || x >= this.L || y >= this.W) return -1;
      const o = this.owner[y * this.L + x];
      return o === BLOCKED ? -2 : o - 1;
    }
  }

  // ------------------------------------------------- blocked regions ---

  // Rasterize polygons in absolute strip coordinates (defects, clamps, holes
  // in a remnant). Returns patches {x, y, mask} clipped to the width.
  function rasterizeRegions(polys, width) {
    const patches = [];
    for (const poly of polys) {
      const b = bounds(poly);
      const x0 = Math.floor(b.minX), y0 = Math.floor(b.minY);
      const local = poly.map(([x, y]) => [x - x0, y - y0]);
      const mask = rasterize(local, b.maxX - x0, b.maxY - y0);
      patches.push({ x: x0, y: y0, mask });
    }
    return { patches, width };
  }

  function blockedMask(regions, width, length) {
    if (!regions.patches.length) return null;
    const m = new Uint8Array(width * length);
    for (const { x, y, mask } of regions.patches) {
      for (let i = 0; i < mask.h; i++) {
        const r = y + i;
        if (r < 0 || r >= width) continue;
        for (let j = 0; j < mask.w; j++) {
          const c = x + j;
          if (c < 0 || c >= length || !mask.data[i * mask.w + j]) continue;
          m[r * length + c] = 1;
        }
      }
    }
    return m;
  }

  // ------------------------------------------------- NCC (Meng 2025) ---

  /** One greedy pass in the given order. Returns {placements, length, failed}. */
  function nccGreedy(items, order, width, length, gap, blocked) {
    const W = width, L = length;
    const occ = blocked ? Uint8Array.from(blocked) : new Uint8Array(W * L);
    const PW = W + 2, PL = L + 2;                     // padded substrate
    const S = new Uint8Array(PW * PL);
    const II = new Int32Array((PW + 1) * (PL + 1));   // integral image
    const RP = new Int32Array(PW * (PL + 1));         // row prefix sums
    const holeMark = new Int32Array(W * L);
    const stack = new Int32Array(W * L);
    const placements = [];
    let Lo = 0, failed = 0, first = true;

    for (const id of order) {
      const item = items[id];
      let nTmin = Infinity;
      for (const v of item.variants) nTmin = Math.min(nTmin, v.nT);

      // Inverted substrate: 1 = free, 0 = occupied. The 1-cell border of 0s
      // lets the template's empty margin hang over the strip edge.
      S.fill(0);
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < L; j++) S[(i + 1) * PL + j + 1] = occ[i * L + j] ? 0 : 1;
      }
      if (!first || blocked) fillSmallHoles(S, occ, W, L, PL, nTmin, holeMark, stack);

      for (let i = 0; i < PW; i++) {
        let run = 0;
        const rb = i * (PL + 1);
        RP[rb] = 0;
        for (let j = 0; j < PL; j++) {
          run += S[i * PL + j];
          RP[rb + j + 1] = run;
          II[(i + 1) * (PL + 1) + j + 1] = II[i * (PL + 1) + j + 1] + run;
        }
      }

      let Lp = 0;
      for (const v of item.variants) Lp = Math.max(Lp, v.tmpl.w, v.tmpl.h);
      let Lr = first ? 1.5 * Lp : Math.max(1.5 * Lp, Lo - Lp);   // Eqs. 8, 12

      let best = null;
      for (;;) {
        let widest = true;
        for (const v of item.variants) {
          const tw = v.tmpl.w, th = v.tmpl.h, nT = v.nT;
          const n = (tw + 2) * (th + 2);
          const tbar = nT / n;
          const tvar = nT - (nT * nT) / n;
          const runs = v.tmplRuns;
          const cmax = Math.min(Math.floor(Lr), L - tw);
          if (cmax < L - tw) widest = false;
          for (let r = 0; r <= W - th; r++) {
            const top = r * (PL + 1), bot = (r + th + 2) * (PL + 1);
            for (let c = 0; c <= cmax; c++) {
              // Free cells in the template window (with its 1-cell margin).
              const A = II[bot + c + tw + 2] - II[bot + c] - II[top + c + tw + 2] + II[top + c];
              if (A < nT) continue;
              // Free cells under the template itself: equals nT iff no overlap (Eq. 9).
              let P = 0;
              for (let k = 0; k < runs.length; k += 3) {
                const rb = (r + 1 + runs[k]) * (PL + 1) + c + 1;
                P += RP[rb + runs[k + 2]] - RP[rb + runs[k + 1]];
              }
              if (P !== nT) continue;
              // Eq. 6 for binary images.
              const svar = A - (A * A) / n;
              const den = svar * tvar;
              const score = den > 1e-9 ? (P - tbar * A) / Math.sqrt(den) : 0;
              if (!best || score > best.score + 1e-9 ||
                  (score > best.score - 1e-9 && (c < best.c || (c === best.c && r < best.r)))) {
                best = { score, r, c, v };
              }
            }
          }
        }
        if (best || widest) break;
        Lr += Lp;                                    // Eq. 13: widen the window
      }

      if (!best) { failed++; continue; }
      const x = best.c + gap, y = best.r + gap;
      const br = best.v.bodyRuns;
      for (let k = 0; k < br.length; k += 3) {
        const base = (y + br[k]) * L + x;
        for (let j = br[k + 1]; j < br[k + 2]; j++) occ[base + j] = 1;
      }
      placements.push({ id, rot: best.v.rot, x, y, score: best.score });
      Lo = Math.max(Lo, best.c + best.v.tmpl.w);
      first = false;
    }
    return { placements, length: layoutLength(items, placements), failed };
  }

  // Free regions with fewer cells than the template can never take it:
  // mark them occupied for this item only.
  function fillSmallHoles(S, occ, W, L, PL, nT, mark, stack) {
    mark.fill(0);
    let label = 0;
    for (let s = 0; s < W * L; s++) {
      if (occ[s] || mark[s]) continue;
      label++;
      let sp = 0, size = 0;
      stack[sp++] = s; mark[s] = label;
      const cells = [];
      while (sp) {
        const k = stack[--sp];
        size++;
        if (size < nT) cells.push(k);
        const i = (k / L) | 0, j = k - i * L;
        if (j > 0 && !occ[k - 1] && !mark[k - 1]) { mark[k - 1] = label; stack[sp++] = k - 1; }
        if (j < L - 1 && !occ[k + 1] && !mark[k + 1]) { mark[k + 1] = label; stack[sp++] = k + 1; }
        if (i > 0 && !occ[k - L] && !mark[k - L]) { mark[k - L] = label; stack[sp++] = k - L; }
        if (i < W - 1 && !occ[k + L] && !mark[k + L]) { mark[k + L] = label; stack[sp++] = k + L; }
      }
      if (size < nT) {
        for (const k of cells) {
          const i = (k / L) | 0, j = k - i * L;
          S[(i + 1) * PL + j + 1] = 0;
        }
      }
    }
  }

  /** The paper's order: largest Lh + Lv first (Eq. 2). */
  function largestFirst(items) {
    return items.map((p) => p.id).sort((a, b) => {
      const pa = items[a].variants[0].tmpl, pb = items[b].variants[0].tmpl;
      return (pb.w + pb.h) - (pa.w + pa.h) || a - b;
    });
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----------------------------------------------------------- metrics ---

  function layoutLength(items, placements) {
    let len = 0;
    for (const p of placements) len = Math.max(len, p.x + variantOf(items[p.id], p.rot).body.w);
    return len;
  }

  // ----------------------------------------------------------- problem ---

  /**
   * Set up one arrangement problem. All geometry is in cells.
   *
   *   width    strip width
   *   gap      minimum distance between items and from edges/blocked cells
   *   items    item specs (see prepareItems)
   *   blocked  polygons in strip coordinates that no item may use
   *
   * Lengths passed to the methods below are optional: they default to a
   * safe upper bound, so the algorithm never runs out of strip.
   */
  function createProblem({ width, gap = 0, items: specs, blocked = [] }) {
    if (!(width > 0) || width !== Math.floor(width)) throw new Error('Arrange: width must be a positive whole number of cells');
    if (gap < 0 || gap !== Math.floor(gap)) throw new Error('Arrange: gap must be a whole number of cells');
    const items = prepareItems(specs || [], gap);
    for (const it of items) {
      if (!it.variants.some((v) => v.tmpl.h <= width)) {
        throw new Error(`Arrange: item ${it.id} is wider than the strip in every allowed rotation`);
      }
    }
    const regions = rasterizeRegions(blocked, width);
    let blockedEnd = 0;
    for (const p of regions.patches) blockedEnd = Math.max(blockedEnd, p.x + p.mask.w);
    let maxDim = 0;
    for (const it of items) for (const v of it.variants) maxDim = Math.max(maxDim, v.tmpl.w, v.tmpl.h);
    const allIds = items.map((it) => it.id);

    const maskFor = (length) => blockedMask(regions, width, length);
    const board = (length) => new Board(width, length, gap, maskFor(length));

    /**
     * Baseline "by shelves": columns of bounding boxes, longest first, no
     * nesting, each item in its first rotation that fits the width. This is
     * how layouts are often made by hand; use it as the number to beat.
     * `start` shifts the first column (e.g. to fill after existing work).
     */
    function shelf(ids = allIds, start = 0) {
      const list = ids.map((id) => {
        const it = items[id];
        return { it, v: it.variants.find((v) => v.tmpl.h <= width) };
      });
      list.sort((a, b) => b.v.w - a.v.w || b.v.h - a.v.h);
      // Worst case: one column per item, plus single-cell steps past blocked cells.
      let room = start + blockedEnd + maxDim + 2 * gap;
      for (const { v } of list) room += v.body.w + gap;
      const b = board(room);
      const placements = [];
      let colX = start + gap, colW = 0, y = gap;
      for (const { it, v } of list) {
        for (;;) {
          if (y + v.body.h > width - gap) { colX += colW ? colW + gap : 1; colW = 0; y = gap; continue; }
          if (colX + v.tmpl.w > room) throw new Error('Arrange: shelf ran out of room');
          if (b.fitsVariant(v, colX, y)) break;
          y++;
        }
        b.paint(v, colX, y, it.id + 1);
        placements.push({ id: it.id, rot: v.rot, x: colX, y });
        y += v.body.h + gap;
        colW = Math.max(colW, v.body.w);
      }
      return placements;
    }

    let defaultLen = null;
    function defaultLength() {
      if (defaultLen === null) defaultLen = Math.ceil(layoutLength(items, shelf()) * 1.3 + maxDim);
      return defaultLen;
    }

    function greedy(order = largestFirst(items), length = defaultLength()) {
      return nccGreedy(items, order, width, length, gap, maskFor(length));
    }

    /**
     * Order search around the greedy pass: start from the largest-first
     * order, then try random swaps / moves and keep any order that is not
     * longer. Call step() as often as time allows (e.g. once per frame).
     */
    function search({ seed = 1, length = defaultLength() } = {}) {
      const rand = mulberry32(seed);
      const mask = maskFor(length);
      const run = (order) => nccGreedy(items, order, width, length, gap, mask);
      let bestOrder = largestFirst(items);
      let best = run(bestOrder);
      const initial = best;
      let iterations = 1;

      const better = (a, b) => (a.failed !== b.failed ? a.failed < b.failed : a.length <= b.length);

      function mutate(order) {
        const o = order.slice();
        const n = o.length;
        const i = Math.floor(rand() * n);
        let j = Math.floor(rand() * n);
        if (rand() < 0.5) {
          [o[i], o[j]] = [o[j], o[i]];
        } else {
          const [x] = o.splice(i, 1);
          j = Math.floor(rand() * n);
          o.splice(j, 0, x);
        }
        return o;
      }

      return {
        get best() { return best; },
        get initial() { return initial; },
        get iterations() { return iterations; },
        get order() { return bestOrder.slice(); },
        step() {
          if (items.length < 2) return best;
          const cand = mutate(bestOrder);
          const res = run(cand);
          iterations++;
          if (better(res, best)) { best = res; bestOrder = cand; }
          return best;
        },
      };
    }

    /** Run the search synchronously; stops at `iterations` or `timeMs`. */
    function pack({ seed = 1, iterations = 200, timeMs = Infinity, length } = {}) {
      const s = search({ seed, length });
      const t0 = Date.now();
      while (s.iterations < iterations && Date.now() - t0 < timeMs) s.step();
      return { ...s.best, iterations: s.iterations };
    }

    function blockedCells(length) {
      const m = maskFor(length);
      if (!m) return 0;
      let n = 0;
      for (let k = 0; k < m.length; k++) n += m[k];
      return n;
    }

    function metrics(placements) {
      const length = layoutLength(items, placements);
      const area = placements.reduce((s, p) => s + items[p.id].area, 0);
      const used = length * width - (length ? blockedCells(length) : 0);
      return {
        length, area, used,
        utilization: used ? area / used : 0,
        waste: used ? 1 - area / used : 0,
      };
    }

    /** Independent check of a layout against the placement rules. */
    function validate(placements, length) {
      let rotations = true;
      const known = placements.filter((p) => {
        const good = !!(items[p.id] && variantOf(items[p.id], p.rot));
        if (!good) rotations = false;
        return good;
      });
      if (length === undefined) length = layoutLength(items, known) + gap + 1;
      const b = board(length);
      let inBounds = true;
      const ok = [];
      for (const p of known) {
        const it = items[p.id], v = variantOf(it, p.rot);
        if (p.x < 0 || p.y < 0 || p.x + v.body.w > length || p.y + v.body.h > width) { inBounds = false; continue; }
        b.place(it, p.rot, p.x, p.y);
        ok.push(p);
      }
      let noOverlap = true;
      for (const p of ok) {
        if (!b.fits(items[p.id], p.rot, p.x, p.y, p.id)) { noOverlap = false; break; }
      }
      const seen = new Set(placements.map((p) => p.id));
      const complete = seen.size === items.length && placements.length === items.length &&
        placements.every((p) => items[p.id]);
      return { inBounds, noOverlap, rotations, complete, ok: inBounds && noOverlap && rotations && complete };
    }

    return {
      width, gap, items,
      board, shelf, greedy, search, pack, metrics, validate, defaultLength,
      layoutLength: (placements) => layoutLength(items, placements),
      largestFirst: () => largestFirst(items),
    };
  }

  // ---------------------------------------------------------- protocol ---
  //
  // The contract between the engine and its connectors. A connector turns
  // its domain (a garment order, a DXF file, an ERP job) into a request, and
  // reads placements back from the response. Requests and responses are
  // plain JSON in the connector's own units; the engine converts to cells
  // and back. Spec: arrange/PROTOCOL.md. Schema: arrange/protocol.schema.json.

  const PROTOCOL = 'arrange/1';
  const DEFAULT_SEARCH = { seed: 1, iterations: 200, timeMs: 5000 };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isPoly = (p) => Array.isArray(p) && p.length >= 3 &&
    p.every((pt) => Array.isArray(pt) && pt.length === 2 && isNum(pt[0]) && isNum(pt[1]));
  const round6 = (v) => Math.round(v * 1e6) / 1e6;

  /** Problems with a request, as a list of messages. Empty means valid. */
  function checkRequest(req) {
    const errs = [];
    if (!req || typeof req !== 'object') return ['request must be an object'];
    if (req.protocol !== PROTOCOL) errs.push(`protocol must be "${PROTOCOL}"`);
    if (req.task !== undefined && req.task !== 'solve' && req.task !== 'evaluate') errs.push('task must be "solve" or "evaluate"');
    const cs = req.cellSize === undefined ? 1 : req.cellSize;
    if (!isNum(cs) || cs <= 0) errs.push('cellSize must be a positive number');
    if (req.units !== undefined && typeof req.units !== 'string') errs.push('units must be a string');
    const s = req.strip;
    if (!s || typeof s !== 'object') {
      errs.push('strip is required');
    } else {
      if (!isNum(s.width) || s.width <= 0) errs.push('strip.width must be a positive number');
      else if (isNum(cs) && cs > 0 && Math.floor(s.width / cs + 1e-9) < 1) errs.push('strip.width is smaller than one cell');
      if (s.gap !== undefined && (!isNum(s.gap) || s.gap < 0)) errs.push('strip.gap must be a number >= 0');
      if (s.maxLength !== undefined && (!isNum(s.maxLength) || s.maxLength <= 0)) errs.push('strip.maxLength must be a positive number');
      if (s.blocked !== undefined && (!Array.isArray(s.blocked) || !s.blocked.every(isPoly))) errs.push('strip.blocked must be a list of polygons');
    }
    if (!Array.isArray(req.items) || !req.items.length) {
      errs.push('items must be a non-empty list');
    } else {
      req.items.forEach((it, i) => {
        if (!it || !isPoly(it.polygon)) errs.push(`items[${i}].polygon must be 3+ [x, y] points`);
        if (it && it.rotations !== undefined && (!Array.isArray(it.rotations) || !it.rotations.length || !it.rotations.every(isNum))) errs.push(`items[${i}].rotations must be a non-empty list of degrees`);
        if (it && it.quantity !== undefined && !(Number.isInteger(it.quantity) && it.quantity >= 1)) errs.push(`items[${i}].quantity must be a whole number >= 1`);
        if (it && it.key !== undefined && typeof it.key !== 'string') errs.push(`items[${i}].key must be a string`);
      });
    }
    const se = req.search;
    if (se !== undefined) {
      if (typeof se !== 'object' || se === null) errs.push('search must be an object');
      else for (const k of ['seed', 'iterations', 'timeMs']) if (se[k] !== undefined && !isNum(se[k])) errs.push(`search.${k} must be a number`);
    }
    if (req.task === 'evaluate' && !Array.isArray(req.placements)) errs.push('placements are required for task "evaluate"');
    return errs;
  }

  // Echo the connector's unit label, if it sent one.
  const unitsOf = (req) => (req && typeof req.units === 'string' ? { units: req.units } : {});

  function invalid(req, errors) {
    return { protocol: PROTOCOL, status: 'invalid', ...unitsOf(req), errors };
  }

  /**
   * Open a request for incremental work: searching a little at a time,
   * evaluating layouts made elsewhere (a person, an old system). Throws on
   * an invalid request. `problem` is the core problem in cells, for
   * connectors that need live placement checks.
   */
  function session(req) {
    const errs = checkRequest(req);
    if (errs.length) throw new Error('Arrange: invalid request: ' + errs.join('; '));
    const cs = req.cellSize === undefined ? 1 : req.cellSize;
    const toCells = (poly) => poly.map(([x, y]) => [x / cs, y / cs]);
    const strip = req.strip;
    const widthCells = Math.floor(strip.width / cs + 1e-9);
    const gapCells = Math.ceil((strip.gap || 0) / cs - 1e-9);
    const searchLen = strip.maxLength === undefined ? undefined : Math.floor(strip.maxLength / cs + 1e-9);

    // One entry per item copy, in core id order.
    const refs = [];
    req.items.forEach((it, index) => {
      const qty = it.quantity === undefined ? 1 : it.quantity;
      for (let copy = 0; copy < qty; copy++) refs.push({ key: it.key === undefined ? String(index) : it.key, copy, polygon: it.polygon });
    });

    const problem = createProblem({
      width: widthCells,
      gap: gapCells,
      blocked: (strip.blocked || []).map(toCells),
      items: req.items.map((it) => ({
        polygon: toCells(it.polygon),
        rotations: it.rotations || [0],
        quantity: it.quantity,
        data: it.data,
      })),
    });
    const opts = { ...DEFAULT_SEARCH, ...(req.search || {}) };
    let search = null, t0 = 0, ms = 0;

    function out(p) {
      const ref = refs[p.id];
      const r = rotatePolygon(ref.polygon, p.rot);
      const b = bounds(r);
      const tx = p.x * cs - b.minX, ty = p.y * cs - b.minY;
      return {
        item: p.id, key: ref.key, copy: ref.copy, rotation: p.rot,
        x: round6(p.x * cs), y: round6(p.y * cs),
        translate: [round6(tx), round6(ty)],
        polygon: r.map(([x, y]) => [round6(x + tx), round6(y + ty)]),
      };
    }

    function report(placements, extra) {
      const m = problem.metrics(placements);
      const check = problem.validate(placements, searchLen);   // maxLength is a real edge
      const placed = new Set(placements.map((p) => p.id));
      const unplaced = refs.map((_, i) => i).filter((i) => !placed.has(i));
      const duplicates = placed.size !== placements.length;
      const status = !(check.inBounds && check.noOverlap && check.rotations) || duplicates ? 'rejected'
        : unplaced.length ? 'incomplete' : 'ok';
      return {
        protocol: PROTOCOL, status, ...unitsOf(req),
        length: round6(m.length * cs),
        utilization: round6(m.utilization),
        placements: placements.map(out),
        unplaced,
        check,
        ...extra,
      };
    }

    function baseline() {
      if (req.baseline === false) return {};
      const m = problem.metrics(problem.shelf());
      return { baseline: { length: round6(m.length * cs), utilization: round6(m.utilization) } };
    }

    function step(budgetMs = 0) {
      if (!search) { t0 = Date.now(); search = problem.search({ seed: opts.seed, length: searchLen }); }
      const s = Date.now();
      do {
        if (search.iterations >= opts.iterations) break;
        search.step();
      } while (Date.now() - s < budgetMs);
      ms = Date.now() - t0;
      return progress();
    }

    function progress() {
      if (!search) return { iterations: 0, length: null, initialLength: null, ms: 0 };
      return {
        iterations: search.iterations,
        length: round6(search.best.length * cs),
        initialLength: round6(search.initial.length * cs),
        ms,
      };
    }

    function stats() {
      return { stats: { iterations: search.iterations, ms, grid: { width: widthCells, length: searchLen || problem.defaultLength() }, cellSize: cs } };
    }

    return {
      problem, cellSize: cs, step, progress,
      /** Has the search used up its iteration or time budget? */
      get done() {
        return !!search && (search.iterations >= opts.iterations || ms >= opts.timeMs || problem.items.length < 2);
      },
      result() {
        if (!search) step(0);
        return report(search.best.placements, { ...baseline(), ...stats() });
      },
      evaluate(placements) {
        const core = [], errors = [];
        (placements || []).forEach((p, i) => {
          const it = p && problem.items[p.item];
          const rot = p && p.rotation === undefined ? 0 : p && p.rotation;
          if (!it) errors.push(`placements[${i}].item must be an item index from 0 to ${refs.length - 1}`);
          else if (!isNum(p.x) || !isNum(p.y)) errors.push(`placements[${i}] needs numeric x and y`);
          else if (!variantOf(it, rot)) errors.push(`placements[${i}].rotation ${rot} is not allowed for item ${p.item}`);
          else core.push({ id: p.item, rot, x: Math.round(p.x / cs), y: Math.round(p.y / cs) });
        });
        if (errors.length) return invalid(req, errors);
        return report(core, baseline());
      },
      reset() { search = null; ms = 0; },
    };
  }

  /** Search until the request's iteration or time budget runs out. */
  function solve(req) {
    const errs = checkRequest(req);
    if (errs.length) return invalid(req, errs);
    let s;
    try { s = session(req); } catch (e) { return invalid(req, [e.message.replace(/^Arrange: /, '')]); }
    while (!s.done) s.step(50);
    return s.result();
  }

  /** Score and check a layout made elsewhere, without searching. */
  function evaluate(req) {
    const errs = checkRequest({ ...req, task: 'evaluate' });
    if (errs.length) return invalid(req, errs);
    let s;
    try { s = session(req); } catch (e) { return invalid(req, [e.message.replace(/^Arrange: /, '')]); }
    return s.evaluate(req.placements);
  }

  /** One request in, one response out: the entry point for any transport. */
  function run(req) {
    return req && req.task === 'evaluate' ? evaluate(req) : solve(req);
  }

  const Arrange = {
    // protocol: what connectors use
    PROTOCOL, run, solve, evaluate, session, checkRequest,
    // core: cells, for interactive connectors and tests
    createProblem, prepareItems, variantOf, Board,
    polygonArea, normalizePolygon, scalePolygon, rotatePolygon,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Arrange;
  else root.Arrange = Arrange;
})(typeof window !== 'undefined' ? window : globalThis);
