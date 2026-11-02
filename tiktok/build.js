// Renders render.html into a 1080×1920 MP4: audio through OfflineAudioContext, frames piped into ffmpeg.
// Usage: node tiktok/build.js [output.mp4] [--preview t1,t2,...]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const previewIdx = args.indexOf('--preview');
const previewTimes = previewIdx >= 0 ? args[previewIdx + 1].split(',').map(Number) : null;
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && i !== previewIdx + 1) || path.join(__dirname, 'euclid-rhythms-tiktok.mp4'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('page error:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'render.html'));
  const fonts = await page.evaluate(() => window.ready);
  console.log('fonts available:', fonts);

  if (previewTimes) {
    for (const t of previewTimes) {
      const png = await page.evaluate(t => window.framePNG(t), t);
      const file = path.join(path.dirname(out), `preview-${String(t).replace('.', '_')}.png`);
      fs.writeFileSync(file, Buffer.from(png, 'base64'));
      console.log('preview', file);
    }
    await browser.close();
    return;
  }

  const { FPS, DURATION } = await page.evaluate(() => window.VIDEO);
  const audio = await page.evaluate(() => window.renderAudio());
  const wavPath = out.replace(/\.mp4$/, '.wav');
  fs.writeFileSync(wavPath, Buffer.from(audio.wav, 'base64'));
  console.log('audio rendered,', audio.hits, 'bell hits');

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-i', wavPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited with ' + code))));

  const frames = Math.round(DURATION * FPS);
  for (let f = 0; f < frames; f++) {
    const jpg = await page.evaluate(t => window.frameJPEG(t), f / FPS);
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  fs.unlinkSync(wavPath);
  await browser.close();
  console.log('written', out);
})().catch(e => { console.error(e); process.exit(1); });
