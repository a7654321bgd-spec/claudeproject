// Plans the square's path: it flies diagonally at a constant speed and meets a wall exactly at every
// hit time. At each hit it bounces off either a vertical or a horizontal wall; a depth-first search
// picks the sequence so that no wall ever cuts across the path and the square never passes through a
// wall it is not meant to touch.
'use strict';

// bound: the path stays inside ±bound.x, ±bound.y, so the lit walls build up into one picture
const DEFAULTS = { speed: 780, half: 26, wallLen: 150, wallThick: 16, margin: 16, seed: 11, inward: 0.75, bound: { x: 1150, y: 1450 } };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grow = (b, d) => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Liang–Barsky: does the segment a→b pass through the box?
function segHitsBox(ax, ay, bx, by, box) {
  let lo = 0, hi = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - box.x0], [dx, box.x1 - ax], [-dy, ay - box.y0], [dy, box.y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > hi) return false; if (r > lo) lo = r; } else { if (r < lo) return false; if (r < hi) hi = r; }
  }
  return lo <= hi;
}

// The wall the square meets at (x, y) while moving along (dx, dy), on the given axis.
function makeWall(x, y, dx, dy, axis, P) {
  const off = P.half + P.wallThick / 2;
  if (axis === 'x') {
    const cx = x + dx * off;
    return { cx, cy: y, w: P.wallThick, h: P.wallLen, nx: -dx, ny: 0,
      box: { x0: cx - P.wallThick / 2, x1: cx + P.wallThick / 2, y0: y - P.wallLen / 2, y1: y + P.wallLen / 2 } };
  }
  const cy = y + dy * off;
  return { cx: x, cy, w: P.wallLen, h: P.wallThick, nx: 0, ny: -dy,
    box: { x0: x - P.wallLen / 2, x1: x + P.wallLen / 2, y0: cy - P.wallThick / 2, y1: cy + P.wallThick / 2 } };
}

function plan(events, duration, opts = {}) {
  const P = Object.assign({}, DEFAULTS, opts);
  const rng = mulberry32(P.seed);
  const u = P.speed / Math.SQRT2;                 // speed along each axis
  const n = events.length;
  const coin = events.map(() => rng());
  const walls = [], segs = [];
  const clear = P.half + P.margin;
  let visited = 0;

  function dfs(k, x, y, dx, dy) {
    if (k === n) return true;
    if (++visited > 2e6) throw new Error('path search gave up');
    // usually bounce back towards the middle, sometimes not, so the path wanders but stays compact
    const towards = a => (a === 'x' ? -dx * -x : 0) + (a === 'y' ? -dy * -y : 0);
    const prefer = towards('x') >= towards('y') ? ['x', 'y'] : ['y', 'x'];
    for (const axis of coin[k] < P.inward ? prefer : prefer.slice().reverse()) {
      const wall = makeWall(x, y, dx, dy, axis, P);
      const roomy = grow(wall.box, P.margin);
      if (walls.some(w => overlap(roomy, w.box))) continue;
      // the new wall must not stand across any stretch already flown (the one arriving here touches it)
      const near = grow(wall.box, clear);
      if (segs.slice(0, -1).some(s => segHitsBox(s.x0, s.y0, s.x1, s.y1, near))) continue;
      const ndx = axis === 'x' ? -dx : dx, ndy = axis === 'y' ? -dy : dy;
      const t0 = events[k].t, t1 = k + 1 < n ? events[k + 1].t : duration;
      const x1 = x + ndx * u * (t1 - t0), y1 = y + ndy * u * (t1 - t0);
      if (Math.abs(x1) > P.bound.x || Math.abs(y1) > P.bound.y) continue;
      // and the flight to the next hit must not run through any earlier wall
      if (walls.some(w => segHitsBox(x, y, x1, y1, grow(w.box, clear)))) continue;
      walls.push(Object.assign(wall, { t: t0, s: events[k].s, kind: events[k].kind }));
      segs.push({ t0, t1, x0: x, y0: y, x1, y1, dx: ndx, dy: ndy });
      if (dfs(k + 1, x1, y1, ndx, ndy)) return true;
      walls.pop(); segs.pop();
    }
    return false;
  }
  if (!dfs(0, 0, 0, 1, 1)) throw new Error('no path fits these hits');
  return { u, half: P.half, walls: walls.map(({ box, ...w }) => w), segs, visited };
}

module.exports = { plan, DEFAULTS };
