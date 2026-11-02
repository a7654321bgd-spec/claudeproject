// Searches seeds for the most watchable race: a comeback, lead changes, a tie before the deciding ring
// and no dull stretches. Usage: node pick-seed.js [from] [to]
'use strict';
const { simulate, analyze } = require('./sim');

const from = +process.argv[2] || 1, to = +process.argv[3] || 6000;

function drama(a) {
  if (!a.done) return null;
  if (a.tFinal < 19 || a.tFinal > 25) return null;         // short enough to finish, long enough to build
  if (a.firstBreak > 0.9) return null;                      // something happens in the first second
  if (!a.tiedBeforeLast) return null;                       // the last ring decides it
  if (a.winnerMaxDeficit < 2 || a.leadChanges < 2) return null;
  if (a.maxInterval > 4.2) return null;
  let s = 2 * a.leadChanges + 3 * Math.min(a.winnerMaxDeficit, 4) + Math.min(a.combos, 3);
  s += 2 * a.neededAll;                                     // "red needs ALL 5 rings" and gets them
  s -= 3 * Math.max(0, a.maxMidInterval - 3.2);             // lulls in the middle lose viewers
  if (a.lastInterval >= 2 && a.lastInterval <= 4) s += 3;  // the decider takes a moment, not forever
  s += Math.min(a.nearMissesLast, 4);                       // edge-of-the-gap scares on the final ring
  s -= Math.abs(a.tFinal - 22) * 0.3;
  return s;
}

const found = [];
for (let seed = from; seed <= to; seed++) {
  const a = analyze(simulate(seed));
  const s = drama(a);
  if (s !== null) found.push({ s: +s.toFixed(2), ...a });
}
found.sort((x, y) => y.s - x.s);
console.log(`${found.length} candidates in seeds ${from}..${to}`);
for (const f of found.slice(0, 12)) {
  console.log(JSON.stringify({
    seed: f.seed, drama: f.s, winner: f.winner ? 'blue' : 'red', score: f.score.join(':'), tFinal: +f.tFinal.toFixed(2),
    first: +f.firstBreak.toFixed(2), maxGap: +f.maxInterval.toFixed(2), last: +f.lastInterval.toFixed(2),
    leads: f.leadChanges, deficit: f.winnerMaxDeficit, needAll: f.neededAll, midGap: +f.maxMidInterval.toFixed(2),
    combos: f.combos, nearMiss: f.nearMissesLast, notes: f.notes,
  }));
}
