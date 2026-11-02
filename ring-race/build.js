// Renders the race to a 1080×1920 60 fps MP4 for TikTok.
// The race is simulated here in Node (sim.js), then render.html draws it and synthesises the sound.
//
//   node build.js                       → episode 1, ring-race.mp4
//   node build.js --episode 2           → episode 2, the rematch
//   node build.js --seed 3207 --out test.mp4   → any other race (texts of episode 1)
//   node build.js --preview 0,5.5,21    → PNG stills at those video times, no video
//   node build.js --cover               → only the cover image (<video>-cover.jpg)
//   node build.js --audio-only          → the soundtrack as ring-race.wav, no video
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { simulate, analyze } = require('./sim');

// Seeds picked with pick-seed.js; each episode's texts are drawn on screen.
const EPISODES = {
  1: { seed: 12204, out: 'ring-race.mp4', story: {} },
  2: { seed: 12701, out: 'ring-race-2-revansh.mp4',
    story: { sub: 'реванш · досмотри до конца', outro: 'счёт в серии 1:1 — кто возьмёт третий?' } },
};
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const ep = EPISODES[opt('--episode', '1')];
if (!ep) throw new Error('no such episode');
const seed = +opt('--seed', ep.seed);
const out = path.resolve(__dirname, opt('--out', ep.out));
const preview = opt('--preview', null);
const coverOnly = args.includes('--cover');

(async () => {
  const sim = simulate(seed);
  if (sim.tFinal === null) throw new Error(`seed ${seed}: the race never finished`);
  const story = analyze(sim);
  console.log('race', JSON.stringify({ seed, score: sim.score.join(':'), winner: sim.winner ? 'blue' : 'red',
    tFinal: +sim.tFinal.toFixed(2), leadChanges: story.leadChanges, comeback: story.winnerMaxDeficit }));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  const fonts = await page.evaluate(() => window.ready);
  if (!fonts.font) throw new Error('Inter Display is not available to Chromium');
  const info = await page.evaluate(([s, story]) => window.setup(s, story), [sim, ep.story]);
  console.log('video', JSON.stringify(info));

  const still = async (t, file, type) => {
    const b64 = await page.evaluate(([t, type]) => type === 'png' ? window.framePNG(t) : window.frameJPEG(t), [t, type]);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('wrote', file);
  };
  if (preview) {
    const dir = path.join(__dirname, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of preview.split(',').map(Number)) await still(t, path.join(dir, `t${t.toFixed(2)}.png`), 'png');
    await browser.close();
    return;
  }
  await still(0.35, out.replace(/\.mp4$/, '-cover.jpg'), 'jpg');
  if (coverOnly) { await browser.close(); return; }

  const audio = await page.evaluate(() => window.renderAudio());
  const wav = out.replace(/\.mp4$/, '.wav');
  fs.writeFileSync(wav, Buffer.from(audio.wav, 'base64'));
  console.log('audio:', audio.notes, 'melody notes');
  if (args.includes('--audio-only')) { await browser.close(); console.log('wrote', wav); return; }

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(info.FPS), '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', c => c === 0 ? ok() : fail(new Error('ffmpeg exited with ' + c))));

  const frames = Math.round(info.DURATION * info.FPS);
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const jpg = await page.evaluate(t => window.frameJPEG(t), f / info.FPS);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  fs.unlinkSync(wav);
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
