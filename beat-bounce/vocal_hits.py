#!/usr/bin/env python3
"""Hits on the words instead of the drums.

Takes a clip already analysed by analyze.py (its start, length, drop and envelopes) and replaces the
hits with the starts of sung or rapped syllables:

    python3 vocal_hits.py track.mp3 andy.json --out andy-vocal.json

There is no speech recognition here. The track is split into its harmonic and percussive parts by
median filtering the spectrogram (drums are short and broadband, a voice holds its pitch for a while),
and syllable starts are the sharp rises of the harmonic part in the voice band, picked against a
running threshold. Hits closer together than --min-gap are merged.
"""
import argparse
import json
import subprocess

import numpy as np

SR, N, HOP = 22050, 1024, 128           # 5.8 ms between frames
VOICE = (250, 3500)


def decode(path, start, dur):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR),
                          '-af', f'atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def median_filter(a, size, axis):
    pad = [(0, 0)] * a.ndim
    pad[axis] = (size // 2, size // 2)
    p = np.pad(a, pad, mode='edge')
    shifted = [np.take(p, range(i, i + a.shape[axis]), axis=axis) for i in range(size)]
    return np.median(np.stack(shifted), axis=0)


def syllable_onsets(x, min_gap, sensitivity):
    win = np.hanning(N).astype(np.float32)
    frames = 1 + (len(x) - N) // HOP
    f = np.fft.rfftfreq(N, 1 / SR)
    band = (f >= VOICE[0]) & (f < VOICE[1])
    idx = np.arange(N)[None, :] + HOP * np.arange(frames)[:, None]
    S = np.abs(np.fft.rfft(x[idx] * win, axis=1))[:, band].astype(np.float32)
    H = median_filter(S, 31, axis=0)                     # steady in time: voice, chords
    P = median_filter(S, 17, axis=1)                     # steady across frequency: drums, hats
    harm = S * (H ** 2 / (H ** 2 + P ** 2 + 1e-12))
    logh = np.log1p(50 * harm)
    flux = np.maximum(0, np.diff(logh, axis=0)).sum(axis=1)
    flux = np.convolve(flux, np.hanning(7) / np.hanning(7).sum(), 'same')
    level = logh.sum(axis=1)[1:]
    t = (np.arange(len(flux)) * HOP + HOP / 2 + N / 2) / SR
    # running threshold: half a second of context either side
    w = int(0.5 * SR / HOP)
    thr = np.array([np.median(flux[max(0, i - w): i + w]) for i in range(len(flux))]) * sensitivity
    voiced = level > np.percentile(level, 25)            # skip moments with no voice at all
    peaks = [i for i in range(1, len(flux) - 1)
             if flux[i] > thr[i] and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1] and voiced[i]]
    out = []
    for i in sorted(peaks, key=lambda i: -flux[i]):      # strongest first, so a merge keeps the clear start
        if all(abs(t[i] - t[j]) >= min_gap for j in out):
            out.append(i)
    out.sort()
    strength = flux[out] / np.percentile(flux[out], 90) if out else []
    return [(float(t[i]), float(min(1.0, s))) for i, s in zip(out, strength)]


def stem_onsets(path, min_gap, rise_db):
    """Word and syllable starts in a separated vocal stem (separate.py): the voice's level jumps
    by at least rise_db from the dip just before to the peak just after."""
    import wave
    w = wave.open(path)
    sr = w.getframerate()
    v = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, w.getnchannels()).mean(axis=1) / 32768
    hop = sr // 200                                      # 5 ms
    env = np.array([np.sqrt(np.mean(v[i:i + 2 * hop] ** 2)) for i in range(0, len(v) - 2 * hop, hop)])
    db = 20 * np.log10(env + 1e-6)
    floor = np.percentile(db, 95) - 28                   # quieter than this is not singing
    d = np.diff(np.convolve(db, np.ones(3) / 3, 'same'), prepend=db[0])
    cand = []
    for i in range(2, len(db) - 12):
        if d[i] <= 0 or d[i] < d[i - 1] or d[i] < d[i + 1]:
            continue
        before, after = db[max(0, i - 16): i].min(), db[i: i + 12].max()
        if after > floor and after - before >= rise_db:
            j = i - 16 + int(np.argmin(db[max(0, i - 16): i])) if i >= 16 else int(np.argmin(db[:i]))
            k = j + int(np.argmax(np.diff(db[j: i + 12]))) + 1   # steepest point of the rise
            cand.append((k * hop / sr + hop / sr, after - before))
    out = []
    for tt, rise in sorted(cand, key=lambda c: -c[1]):
        if all(abs(tt - o[0]) >= min_gap for o in out):
            out.append((tt, rise))
    out.sort()
    top = np.percentile([r for _, r in out], 90) if out else 1
    return [(tt, min(1.0, r / top)) for tt, r in out]


def main(track, beats_path, out, min_gap, sensitivity, vocals=None, rise_db=6.0):
    d = json.load(open(beats_path))
    if vocals:
        hits = stem_onsets(vocals, min_gap, rise_db)
    else:
        x = decode(track, d['start'], d['duration'])
        hits = syllable_onsets(x, min_gap, sensitivity)
    drop_t = d['drop'] - d['start']
    events = [{'t': 0.0, 's': 1.0, 'kind': 'start'}]
    # the first syllable at or after the drop takes the drop's fireworks
    drop_i = next((i for i, (tt, _) in enumerate(hits) if tt >= drop_t - 0.05), None)
    for i, (tt, s) in enumerate(hits):
        if tt <= min_gap:
            continue
        kind = 'drop' if i == drop_i else ('beat' if s >= 0.6 else 'eighth')
        events.append({'t': round(tt, 5), 's': round(2.0 if kind == 'drop' else max(0.35, s), 3), 'kind': kind})
    d['events'] = events
    with open(out, 'w') as fh:
        json.dump(d, fh)
    gaps = np.diff([e["t"] for e in events]) if len(events) > 1 else np.array([0.0])
    on_beat = np.mean([min(((e['t'] + d['start'] - d['drop']) / d['period']) % 1,
                           1 - ((e['t'] + d['start'] - d['drop']) / d['period']) % 1) < 0.08 for e in events[1:]])
    print(f"{len(events) - 1} syllable hits in {d['duration']:.1f} s ({(len(events) - 1) / d['duration']:.1f}/s), "
          f"gaps {gaps.min():.3f}–{gaps.max():.2f} s, {100 * on_beat:.0f}% land within 8% of a beat")


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('track')
    ap.add_argument('beats', help='the clip analysis from analyze.py')
    ap.add_argument('--out', required=True)
    ap.add_argument('--min-gap', type=float, default=0.14, help='seconds; closer syllables merge into one hit')
    ap.add_argument('--sensitivity', type=float, default=1.6, help='how far above the running median a rise must go')
    ap.add_argument('--vocals', help='a separated vocal stem of the clip (separate.py); much more exact')
    ap.add_argument('--rise-db', type=float, default=6.0, help='with --vocals: how sharp a jump counts as a new word')
    a = ap.parse_args()
    main(a.track, a.beats, a.out, a.min_gap, a.sensitivity, a.vocals, a.rise_db)
