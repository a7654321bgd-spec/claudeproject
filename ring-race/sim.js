// Deterministic physics for the ring-escape race: two balls, concentric spinning rings with gaps.
// The innermost intact ring is the only one the balls can touch; slipping through its gap breaks it
// and scores a point for that ball. Same seed, same race, so a run can be picked and re-rendered.
'use strict';

const TAU = Math.PI * 2;

const DEFAULTS = {
  cx: 520, cy: 1090,            // arena centre, a little left of TikTok's right-hand buttons
  rings: 15, rIn: 88, rOut: 424,
  ringHalf: 3,                  // half the ring stroke
  ballR: 16,
  gravity: 1300,
  gapIn: 0.8, gapOut: 0.55,     // gap width in radians, inner ring → outer ring
  spinIn: 1.7, spinOut: 0.75,   // |angular speed| in rad/s, directions alternate ring to ring
  vMin: 820, vMinGrow: 30,      // speed floor after a wall bounce, rises with every broken ring
  vMax: 1750,
  jitter: 0.06,                 // random turn of each bounce, keeps paths from settling into loops
  dt: 1 / 1200,
  recordEvery: 5,               // positions are kept at 240 Hz for drawing
  tail: 4,                      // seconds simulated after the last ring breaks
  tMax: 80,
};

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

const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

function makeRings(P, rng) {
  const rings = [];
  for (let i = 0; i < P.rings; i++) {
    const k = P.rings > 1 ? i / (P.rings - 1) : 0;
    rings.push({
      r: P.rIn + (P.rOut - P.rIn) * k,
      gap: P.gapIn + (P.gapOut - P.gapIn) * k,
      omega: (P.spinIn + (P.spinOut - P.spinIn) * k) * (i % 2 ? -1 : 1),
      theta0: rng() * TAU,
      brokenAt: null,
      brokenBy: null,
    });
  }
  return rings;
}

// Gap centre angle of a ring at time t.
const gapAngle = (ring, t) => ring.theta0 + ring.omega * t;

function simulate(seed, overrides = {}) {
  const P = Object.assign({}, DEFAULTS, overrides);
  const rng = mulberry32(seed);
  const rings = makeRings(P, rng);
  const balls = [0, 1].map(b => {
    const a = rng() * TAU, sp = 500 + rng() * 250;
    return { x: P.cx + (b ? 22 : -22), y: P.cy - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
  });
  const score = [0, 0];
  const events = [];
  const xs = [[], []], ys = [[], []];
  const R = P.ballR, contact = P.ballR + P.ringHalf;
  let cur = 0, t = 0, step = 0, tFinal = null;

  while (t < P.tMax) {
    if (step % P.recordEvery === 0) for (let b = 0; b < 2; b++) { xs[b].push(balls[b].x); ys[b].push(balls[b].y); }
    for (const b of balls) { b.vy += P.gravity * P.dt; b.x += b.vx * P.dt; b.y += b.vy * P.dt; }

    // ball against ball: equal masses, elastic
    {
      const a = balls[0], b = balls[1];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < 2 * R && d > 1e-9) {
        const nx = dx / d, ny = dy / d, pen = (2 * R - d) / 2;
        a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          a.vx += rv * nx; a.vy += rv * ny; b.vx -= rv * nx; b.vy -= rv * ny;
          events.push({ type: 'clack', t, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, impact: -rv });
        }
      }
    }

    if (cur < rings.length) {
      const ring = rings[cur];
      const g = gapAngle(ring, t);
      for (let bi = 0; bi < 2; bi++) {
        const b = balls[bi];
        const dx = b.x - P.cx, dy = b.y - P.cy, d = Math.hypot(dx, dy);
        if (d > ring.r + 2) {
          ring.brokenAt = t; ring.brokenBy = bi; score[bi]++;
          events.push({ type: 'break', t, ring: cur, ball: bi, x: b.x, y: b.y, angle: Math.atan2(dy, dx), score: score.slice() });
          cur++;
          if (cur === rings.length) tFinal = t;
          break;
        }
        const inGap = Math.abs(wrap(Math.atan2(dy, dx) - g)) <= ring.gap / 2;
        let nx = 0, ny = 0, pen = 0, px = 0, py = 0, hit = false;
        if (!inGap) {
          const gapToWall = ring.r - d;
          if (gapToWall < contact && d > 1e-9) {
            nx = -dx / d; ny = -dy / d; pen = contact - gapToWall;
            px = P.cx + dx / d * ring.r; py = P.cy + dy / d * ring.r; hit = true;
          }
        } else {
          for (const s of [-1, 1]) {
            const ea = g + s * ring.gap / 2;
            const ex = P.cx + Math.cos(ea) * ring.r, ey = P.cy + Math.sin(ea) * ring.r;
            const qx = b.x - ex, qy = b.y - ey, q = Math.hypot(qx, qy);
            if (q < contact && q > 1e-9) { nx = qx / q; ny = qy / q; pen = contact - q; px = ex; py = ey; hit = true; }
          }
        }
        if (!hit) continue;
        b.x += nx * pen; b.y += ny * pen;
        // the wall moves: reflect the velocity relative to the spinning surface
        const svx = -ring.omega * (py - P.cy), svy = ring.omega * (px - P.cx);
        const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        let vx = rvx - 2 * vn * nx + svx, vy = rvy - 2 * vn * ny + svy;
        const j = (rng() * 2 - 1) * P.jitter, c = Math.cos(j), s = Math.sin(j);
        [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
        const sp = Math.hypot(vx, vy), lo = P.vMin + P.vMinGrow * cur;
        const k = sp < lo ? lo / sp : sp > P.vMax ? P.vMax / sp : 1;
        b.vx = vx * k; b.vy = vy * k;
        events.push({ type: 'bounce', t, ball: bi, ring: cur, x: px, y: py, nx, ny, impact: -vn, cap: inGap });
      }
    }

    t += P.dt; step++;
    if (tFinal !== null && t > tFinal + P.tail) break;
  }

  return {
    seed, params: P, tFinal, score,
    winner: tFinal === null ? -1 : score[0] > score[1] ? 0 : 1,
    rings: rings.map(r => ({ r: r.r, gap: r.gap, omega: r.omega, theta0: r.theta0, brokenAt: r.brokenAt, brokenBy: r.brokenBy })),
    events,
    track: { dt: P.dt * P.recordEvery, x: xs, y: ys },
  };
}

// The story of a race in numbers, used to pick a seed worth posting.
function analyze(res) {
  const breaks = res.events.filter(e => e.type === 'break');
  const n = res.rings.length;
  const out = { seed: res.seed, done: res.tFinal !== null, tFinal: res.tFinal, score: res.score, winner: res.winner };
  if (!out.done) return out;
  const times = breaks.map(b => b.t);
  const intervals = times.map((t, i) => t - (i ? times[i - 1] : 0));
  const majority = (n + 1) / 2;
  let leader = -1, leadChanges = 0, winnerMaxDeficit = 0, combos = 0, neededAll = 0;
  breaks.forEach((b, i) => {
    // the opponent is one ring from winning: the eventual winner had to take every ring left
    const opp = b.score[1 - res.winner], mine = b.score[res.winner];
    if (opp === majority - 1 && mine < opp) neededAll = Math.max(neededAll, n - i - 1);
    const [r, bl] = b.score;
    const now = r > bl ? 0 : bl > r ? 1 : -1;
    if (now !== -1 && leader !== -1 && now !== leader) leadChanges++;
    if (now !== -1) leader = now;
    const other = 1 - res.winner;
    winnerMaxDeficit = Math.max(winnerMaxDeficit, b.score[other] - b.score[res.winner]);
    if (i && b.ball === breaks[i - 1].ball && b.t - breaks[i - 1].t < 0.45) combos++;
  });
  const before = breaks[n - 2].score;
  Object.assign(out, {
    firstBreak: times[0],
    maxInterval: Math.max(...intervals),
    maxMidInterval: Math.max(...intervals.slice(0, n - 1)),
    lastInterval: intervals[n - 1],
    neededAll,
    tiedBeforeLast: before[0] === before[1],
    leadChanges, winnerMaxDeficit, combos,
    notes: res.events.filter(e => e.type === 'bounce' && e.impact > 140).length,
    // a ball clipping the edge of the gap on the deciding ring reads as "almost!"
    nearMissesLast: res.events.filter(e => e.type === 'bounce' && e.cap && e.ring === n - 1).length,
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { simulate, analyze, gapAngle, DEFAULTS };
