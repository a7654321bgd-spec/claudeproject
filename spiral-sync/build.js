// Renders render.html into a seamless 1080×1920 60 fps loop for TikTok.
//   node build.js                     → spiral-sync.mp4 with the ad badge, and spiral-sync-cover.jpg
//   node build.js --ad "ДОМИНО" --ad-sub "@handle · промокод"   → other text on the badge
//   node build.js --no-ad             → spiral-sync-clean.mp4, no badge
//   node build.js --preview 0,13.3,20 → PNG stills in preview/, no video
//   node build.js --audio-only        → the loop's soundtrack as spiral-sync.wav
'use strict';
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const AD = args.includes('--no-ad') ? null : { title: opt('--ad') || 'ДОМИНО', sub: opt('--ad-sub') || '' };
const out = path.join(__dirname, AD ? 'spiral-sync.mp4' : 'spiral-sync-clean.mp4');
const COVER_T = 16;      // two fifths of the loop: the beads draw a five-pointed star
const TARGET_LUFS = -14;

// One constant gain for the whole loop (a dynamic normaliser would make the seam audible),
// capped so true peaks stay under -1 dBTP.
function loudnessGain(wav) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const I = parseFloat(summary.match(/I:\s+(-?[\d.]+) LUFS/)[1]);
  const tp = parseFloat(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]);
  const gain = Math.min(TARGET_LUFS - I, -1 - tp);
  console.log(`loudness ${I} LUFS, true peak ${tp} dBFS → gain ${gain.toFixed(2)} dB`);
  return gain;
}
function runFfmpeg(argv) {
  const ff = spawn('ffmpeg', argv, { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.done = new Promise((ok, fail) => ff.on('close', c => c === 0 ? ok() : fail(new Error('ffmpeg exited with ' + c))));
  return ff;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  if (!(await page.evaluate(() => window.ready)).font) throw new Error('Inter Display is not available to Chromium');
  const { FPS, DURATION } = await page.evaluate(() => window.VIDEO);
  const still = async (t, file, type) => {
    const b64 = await page.evaluate(([t, type]) => type === 'png' ? window.framePNG(t) : window.frameJPEG(t), [t, type]);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('wrote', file);
  };

  await page.evaluate(ad => window.setAd(ad), AD);
  if (opt('--preview')) {
    const dir = path.join(__dirname, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of opt('--preview').split(',').map(Number)) await still(t, path.join(dir, `t${t.toFixed(2)}.png`), 'png');
    await browser.close();
    return;
  }
  // the cover stays clean: it is the thumbnail on the profile grid
  await page.evaluate(() => window.setAd(null));
  await still(COVER_T, path.join(__dirname, 'spiral-sync-cover.jpg'), 'jpg');
  await page.evaluate(ad => window.setAd(ad), AD);

  const audio = await page.evaluate(() => window.renderAudio());
  const wav = out.replace(/\.mp4$/, '.wav');
  fs.writeFileSync(wav, Buffer.from(audio.wav, 'base64'));
  console.log('audio:', audio.notes, 'notes per loop');
  const gain = loudnessGain(wav);
  if (args.includes('--audio-only')) { await browser.close(); console.log('wrote', wav); return; }

  const ff = runFfmpeg([
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', out,
  ]);
  const frames = Math.round(DURATION * FPS), t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const jpg = await page.evaluate(t => window.frameJPEG(t), f / FPS);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 600 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await ff.done;
  fs.unlinkSync(wav);
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
