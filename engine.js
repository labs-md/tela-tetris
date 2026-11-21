/*
 * TelaTetris packing engine.
 *
 * Everything is a raster of 1 cm cells. The roll runs along x (columns);
 * its width runs along y (rows). Pieces keep their grain line along x, so the
 * only allowed rotations are 0° and 180°.
 *
 * Placement rules (shared by the player, the shelf baseline and the algorithm):
 *   - a piece's body (cells its outline touches) may not overlap another body;
 *   - the body grown by `gap` cells (the "template") must stay on the roll and
 *     may not touch another body, so pieces stay `gap` cm apart and `gap` cm
 *     from the roll edges.
 *
 * The algorithm follows Meng et al., Sci. Rep. 15:12320 (2025),
 * doi:10.1038/s41598-025-97202-0: normalized cross-correlation (NCC) between
 * the inverted roll and each piece template, a left-hand search window that
 * grows the layout from left to right, and filling of holes too small for
 * the piece. On top of the paper's single greedy pass, `createSearch` tries
 * other piece orders and keeps the shortest layout.
 *
 * Works as a browser <script> (window.TT) and as a Node module.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ pieces ---

  const SIZE_SCALE = { S: 0.92, M: 1.0, L: 1.08, XL: 1.16 };

  // Outlines in cm for size M, lying with the grain along x.
  const PIECE_TYPES = {
    delantero: {
      name: 'Delantero', color: '#e9fb5a', arrow: true,
      poly: [[2, 6], [0, 18], [8, 26], [0, 34], [2, 46], [10, 49], [22, 52],
             [70, 52], [70, 0], [22, 0], [10, 3]],
    },
    espalda: {
      name: 'Espalda', color: '#e9fb5a', arrow: true,
      poly: [[2, 6], [0, 18], [2, 26], [0, 34], [2, 46], [10, 49], [22, 52],
             [70, 52], [70, 0], [22, 0], [10, 3]],
    },
    manga: {
      name: 'Manga', color: '#c6b3e4', arrow: true,
      poly: [[8, 1], [22, 0], [22, 40], [8, 39], [3, 32], [0, 20], [3, 8]],
    },
    cuello: {
      name: 'Cuello', color: '#f6f6f1', arrow: false,
      poly: [[0, 0], [4, 0], [4, 44], [0, 44]],
    },
    bolsillo: {
      name: 'Bolsillo', color: '#cdc1ba', arrow: false,
      poly: [[0, 0], [11, 0], [14, 7], [11, 14], [0, 14]],
    },
  };

  // One T-shirt = these pieces.
  const GARMENT = [['delantero', 1], ['espalda', 1], ['manga', 2], ['cuello', 1], ['bolsillo', 1]];

  function polyArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    }
    return Math.abs(a) / 2;
  }

  function normalize(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { poly: poly.map(([x, y]) => [x - minX, y - minY]), w: maxX - minX, h: maxY - minY };
  }

  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Conservative raster: a cell is set if the outline touches it (sampled 6x6).
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
            if (pointInPoly(px, py, poly)) hit = true;
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

  // Grow by g cells (Eq. 1 of the paper: dilation with a disk). The radius
  // includes the diagonal neighbours so corner-touching cells keep the gap.
  function dilate(mask, g) {
    const w = mask.w + 2 * g, h = mask.h + 2 * g;
    const data = new Uint8Array(w * h);
    const r2 = g * g + g;
    for (let i = 0; i < mask.h; i++) {
      for (let j = 0; j < mask.w; j++) {
        if (!mask.data[i * mask.w + j]) continue;
        for (let di = -g; di <= g; di++) {
          for (let dj = -g; dj <= g; dj++) {
            if (di * di + dj * dj <= r2) data[(i + g + di) * w + (j + g + dj)] = 1;
          }
        }
      }
    }
    return { data, w, h };
  }

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

  function makeVariant(poly, w, h, rot, gap) {
    const p = rot === 180 ? poly.map(([x, y]) => [w - x, h - y]) : poly;
    const body = rasterize(p, w, h);
    const tmpl = dilate(body, gap);
    return {
      rot, poly: p, body, tmpl,
      bodyRuns: runsOf(body), tmplRuns: runsOf(tmpl),
      nT: count(tmpl),
    };
  }

  /** Build the piece list for an order like {S: 1, M: 2, L: 1}. */
  function makeOrder(counts, gap = 1) {
    const pieces = [];
    let gid = 0;
    for (const size of Object.keys(SIZE_SCALE)) {
      const n = counts[size] || 0;
      for (let k = 0; k < n; k++) {
        gid++;
        for (const [type, qty] of GARMENT) {
          for (let q = 0; q < qty; q++) {
            const t = PIECE_TYPES[type], s = SIZE_SCALE[size];
            const { poly, w, h } = normalize(t.poly.map(([x, y]) => [x * s, y * s]));
            pieces.push({
              id: pieces.length, type, size, garment: gid,
              name: t.name, color: t.color, arrow: t.arrow,
              w, h, area: polyArea(poly),
              variants: [makeVariant(poly, w, h, 0, gap), makeVariant(poly, w, h, 180, gap)],
            });
          }
        }
      }
    }
    return pieces;
  }

  function variantOf(piece, rot) { return piece.variants[rot === 180 ? 1 : 0]; }

  // ------------------------------------------------------------- board ---

  /** Occupancy grid. `owner` holds piece id + 1 for body cells, 0 for free. */
  class Board {
    constructor(width, length, gap) {
      this.W = width; this.L = length; this.gap = gap;
      this.owner = new Int16Array(width * length);
    }

    /** x, y = body top-left in cells. */
    fits(v, x, y, ignoreId = -1) {
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

    place(piece, rot, x, y) { this.paint(variantOf(piece, rot), x, y, piece.id + 1); }
    remove(piece, rot, x, y) { this.paint(variantOf(piece, rot), x, y, 0); }

    ownerAt(x, y) {
      if (x < 0 || y < 0 || x >= this.L || y >= this.W) return -1;
      return this.owner[y * this.L + x] - 1;
    }
  }

  // ----------------------------------------------------------- metrics ---

  function layoutLength(pieces, placements) {
    let len = 0;
    for (const p of placements) len = Math.max(len, p.x + variantOf(pieces[p.id], p.rot).body.w);
    return len;
  }

  function metrics(pieces, placements, width) {
    const length = layoutLength(pieces, placements);
    const area = placements.reduce((s, p) => s + pieces[p.id].area, 0);
    const used = length * width;
    return {
      length, area, used,
      utilization: used ? area / used : 0,
      waste: used ? 1 - area / used : 0,
    };
  }

  /** Independent check of a finished layout. */
  function validate(pieces, placements, width, length, gap) {
    const board = new Board(width, length, gap);
    let inBounds = true;
    for (const p of placements) {
      const v = variantOf(pieces[p.id], p.rot);
      if (p.x < 0 || p.y < 0 || p.x + v.body.w > length || p.y + v.body.h > width) { inBounds = false; continue; }
      board.place(pieces[p.id], p.rot, p.x, p.y);
    }
    let noOverlap = inBounds;
    for (const p of placements) {
      if (!noOverlap) break;
      if (!board.fits(variantOf(pieces[p.id], p.rot), p.x, p.y, p.id)) noOverlap = false;
    }
    const grain = placements.every((p) => p.rot === 0 || p.rot === 180);
    const seen = new Set(placements.map((p) => p.id));
    const complete = seen.size === pieces.length && placements.length === pieces.length;
    return { noOverlap, grain, complete, ok: noOverlap && grain && complete };
  }

  // ---------------------------------------------- baseline: by shelves ---

  /** "Por estantes": columns of bounding boxes, tallest-first, no nesting. */
  function shelfPack(pieces, width, gap, ids = null) {
    const list = (ids || pieces.map((p) => p.id)).map((id) => pieces[id]);
    list.sort((a, b) => b.w - a.w || b.h - a.h);
    const placements = [];
    let colX = gap, colW = 0, y = gap;
    for (const p of list) {
      const v = p.variants[0];
      if (y + v.body.h > width - gap) { colX += colW + gap; colW = 0; y = gap; }
      placements.push({ id: p.id, rot: 0, x: colX, y });
      y += v.body.h + gap;
      colW = Math.max(colW, v.body.w);
    }
    return placements;
  }

  // ----------------------------------------- algorithm: NCC (Meng 2025) ---

  /**
   * One greedy pass in the given order. Returns {placements, length, failed}.
   */
  function nccGreedy(pieces, order, width, length, gap) {
    const W = width, L = length;
    const occ = new Uint8Array(W * L);
    const PW = W + 2, PL = L + 2;                     // padded substrate
    const S = new Uint8Array(PW * PL);
    const II = new Int32Array((PW + 1) * (PL + 1));   // integral image
    const RP = new Int32Array(PW * (PL + 1));         // row prefix sums
    const holeMark = new Int32Array(W * L);
    const stack = new Int32Array(W * L);
    const placements = [];
    let Lo = 0, failed = 0, first = true;

    for (const id of order) {
      const piece = pieces[id];
      const nTmin = Math.min(piece.variants[0].nT, piece.variants[1].nT);

      // Inverted substrate: 1 = free, 0 = occupied. The 1-cell border of 0s
      // lets the template's empty margin hang over the roll edge.
      S.fill(0);
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < L; j++) S[(i + 1) * PL + j + 1] = occ[i * L + j] ? 0 : 1;
      }
      if (!first) fillSmallHoles(S, occ, W, L, PL, nTmin, holeMark, stack);

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
      for (const v of piece.variants) Lp = Math.max(Lp, v.tmpl.w, v.tmpl.h);
      let Lr = first ? 1.5 * Lp : Math.max(1.5 * Lp, Lo - Lp);   // Eqs. 8, 12

      let best = null;
      for (;;) {
        let widest = true;
        for (const v of piece.variants) {
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
    return { placements, length: layoutLength(pieces, placements), failed };
  }

  // Free regions with fewer cells than the template can never take it:
  // mark them occupied for this piece only.
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
  function paperOrder(pieces) {
    return pieces.map((p) => p.id).sort((a, b) => {
      const pa = pieces[a].variants[0].tmpl, pb = pieces[b].variants[0].tmpl;
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

  /**
   * Order search around the greedy pass: start from the paper's order, then
   * try random swaps / moves and keep any order that is not longer.
   * Call step() repeatedly (e.g. once per animation frame).
   */
  function createSearch(pieces, width, length, gap, seed = 1) {
    const rand = mulberry32(seed);
    let bestOrder = paperOrder(pieces);
    let best = nccGreedy(pieces, bestOrder, width, length, gap);
    const paper = best;
    let iterations = 1;

    function better(a, b) {
      if (a.failed !== b.failed) return a.failed < b.failed;
      return a.length <= b.length;
    }

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
      get paper() { return paper; },
      get iterations() { return iterations; },
      step() {
        const cand = mutate(bestOrder);
        const res = nccGreedy(pieces, cand, width, length, gap);
        iterations++;
        if (better(res, best)) { best = res; bestOrder = cand; }
        return best;
      },
    };
  }

  const TT = {
    SIZE_SCALE, PIECE_TYPES, GARMENT,
    makeOrder, variantOf, Board,
    metrics, validate, layoutLength,
    shelfPack, nccGreedy, paperOrder, createSearch,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
  else root.TT = TT;
})(typeof window !== 'undefined' ? window : globalThis);
