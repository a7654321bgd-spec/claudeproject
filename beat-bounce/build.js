// Renders the beat-bounce video: a square that hits a wall on every beat of the track.
// The hits come from analyze.py; the track itself is not in the repository.
//
//   node build.js --track path/to/track.mp3        → beat-bounce.mp4 and beat-bounce-cover.jpg
//   node build.js --beats jealous.json --track jealous.mp3 --out beat-bounce-jealous.mp4 --seed 7 --bound 1600,2000
//                                                   (--seed and --bound steer the path planner, see bounce.js)
//   node build.js --preview 0,3.1,12               → PNG stills in preview/, no track needed
//   --ad-title "Domino Team" --ad-sub "@dtlinkk_bot"   the ad badge in the lower-left corner
'use strict';
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { plan } = require('./bounce');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const beats = JSON.parse(fs.readFileSync(path.resolve(__dirname, opt('--beats', 'beats.json')), 'utf8'));
const out = path.resolve(__dirname, opt('--out', 'beat-bounce.mp4'));
const track = opt('--track', null);
const AD = { title: opt('--ad-title', 'Domino Team'), sub: opt('--ad-sub', '@dtlinkk_bot') };
const TITLE = opt('--title', null), REVEAL_TEXT = opt('--reveal', null);   // headline and the pull-back caption

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', argv, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}
function truePeak(wav) {
  const log = ffmpeg(['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const s = log.slice(log.lastIndexOf('Summary:'));
  return { I: parseFloat(s.match(/I:\s+([-+]?[\d.]+) LUFS/)[1]), tp: parseFloat(s.match(/Peak:\s+([-+]?[\d.]+) dBFS/)[1]) };
}

(async () => {
  const planOpts = { seed: +opt('--seed', 11) };
  if (opt('--bound', null)) { const [bx, by] = opt('--bound').split(',').map(Number); planOpts.bound = { x: bx, y: by }; }
  const p = plan(beats.events, beats.duration, planOpts);
  console.log(`plan: ${p.walls.length} walls, search visited ${p.visited} nodes`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  if (!(await page.evaluate(() => window.ready)).font) throw new Error('Inter Display is not available to Chromium');
  const info = await page.evaluate(([b, pl, ad, title, reveal]) => window.setup({ beats: b, plan: pl, ad, title, reveal }),
    [beats, p, AD, TITLE, REVEAL_TEXT]);
  console.log('video', JSON.stringify(info));
  const still = async (t, file, type) => {
    const b64 = await page.evaluate(([t, type]) => type === 'png' ? window.framePNG(t) : window.frameJPEG(t), [t, type]);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('wrote', file);
  };

  if (opt('--preview', null)) {
    const dir = path.join(__dirname, 'preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of opt('--preview').split(',').map(Number)) await still(t, path.join(dir, `t${t.toFixed(2)}.png`), 'png');
    await browser.close();
    return;
  }
  if (!track) throw new Error('--track path/to/track.mp3 is needed for the sound');
  await still(info.DURATION - 0.05, out.replace(/\.mp4$/, '-cover.jpg'), 'jpg');   // the whole lit picture

  // the clip, cut sample-accurately inside the filter graph (so the fades see the clip's own clock)
  // and kept in float so the hot master does not clip
  const wav = out.replace(/\.mp4$/, '.wav');
  const d = info.DURATION;
  ffmpeg(['-y', '-v', 'error', '-i', track, '-ac', '2', '-ar', '48000',
    '-af', `atrim=start=${beats.start.toFixed(5)}:duration=${d.toFixed(5)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.008,afade=t=out:st=${(d - 0.03).toFixed(4)}:d=0.03`,
    '-c:a', 'pcm_f32le', wav]);
  // 3 dB of headroom: on a master this dense the AAC encoder overshoots by about 2 dB
  const { I, tp } = truePeak(wav), gain = Math.min(0, -3 - tp);
  console.log(`clip ${beats.start.toFixed(3)}–${(beats.start + d).toFixed(3)}s: ${I} LUFS, true peak ${tp} dBFS → gain ${gain.toFixed(2)} dB`);

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(info.FPS), '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', c => (c === 0 ? ok() : fail(new Error('ffmpeg exited with ' + c)))));
  // each frame shows the moment half a frame ahead, so a hit lands on the frame nearest its sound
  const frames = Math.round(d * info.FPS), lead = 0.5 / info.FPS, t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const jpg = await page.evaluate(t => window.frameJPEG(t), f / info.FPS + lead);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 600 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await done;
  fs.unlinkSync(wav);
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
