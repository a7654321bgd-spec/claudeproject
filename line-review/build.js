// Renders the line review of «ДИНАСТИЯ» over the track itself.
//   node build.js --track path/to/dinastiya.mp3    → line-review.mp4 and line-review-cover.jpg
//   node build.js --preview 1,4,20                 → PNG stills in preview/, no track needed
// The beat grid and the drop come from ../beat-bounce/beats.json (analyze.py over the same track).
'use strict';
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { GRADES, LINES, SUMMARY_BAR, END_BAR } = require('./review');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const grid = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'beat-bounce', 'beats.json'), 'utf8'));
const out = path.join(__dirname, 'line-review.mp4');
const bar = b => grid.drop + b * 4 * grid.period;          // song time of a bar, counted from the drop
const start = bar(LINES[0].bar), end = bar(END_BAR);
const data = {
  duration: Math.floor((end - start) * 60) / 60, period: grid.period, firstBeat: 0,
  summaryAt: bar(SUMMARY_BAR) - start, grades: GRADES,
  lines: LINES.map(l => ({ ...l, t: bar(l.bar) - start })),
  ad: { title: opt('--ad-title', 'Domino Team'), sub: opt('--ad-sub', '@dtlinkk_bot') },
};

function ffmpeg(argv) {
  const r = spawnSync('ffmpeg', argv, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  if (!(await page.evaluate(() => window.ready)).font) throw new Error('Inter Display is not available to Chromium');
  const info = await page.evaluate(d => window.setup(d), data);
  console.log(`clip ${start.toFixed(3)}–${end.toFixed(3)} s, ${info.DURATION.toFixed(2)} s, ${LINES.length} lines`);
  const still = async (t, file, type) => {
    const b64 = await page.evaluate(([t, type]) => (type === 'png' ? window.framePNG(t) : window.frameJPEG(t)), [t, type]);
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
  const track = opt('--track', null);
  if (!track) throw new Error('--track path/to/track.mp3 is needed for the sound');
  await still(data.lines[3].t + 1.2, out.replace(/\.mp4$/, '-cover.jpg'), 'jpg');

  const wav = out.replace(/\.mp4$/, '.wav'), d = info.DURATION;
  ffmpeg(['-y', '-v', 'error', '-i', track, '-ac', '2', '-ar', '48000',
    '-af', `atrim=start=${start.toFixed(5)}:duration=${d.toFixed(5)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(d - 0.6).toFixed(3)}:d=0.6`, '-c:a', 'pcm_f32le', wav]);
  const log = ffmpeg(['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tp = parseFloat(log.slice(log.lastIndexOf('Summary:')).match(/Peak:\s+([-+]?[\d.]+) dBFS/)[1]);
  const gain = Math.min(0, -3 - tp);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '60', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', c => (c === 0 ? ok() : fail(new Error('ffmpeg exited with ' + c)))));
  const frames = Math.round(d * 60);
  for (let f = 0; f < frames; f++) {
    const jpg = await page.evaluate(t => window.frameJPEG(t), f / 60);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  fs.unlinkSync(wav);
  await browser.close();
  console.log('wrote', out);
})().catch(e => { console.error(e); process.exit(1); });
