#!/usr/bin/env python3
"""Beat analysis for the beat-bounce video.

Fits the beat grid to the track, finds the drop, cuts the clip (two bars before the drop and
sixteen after) and picks the moments the square hits a wall. Writes beats.json for build.js.

    python3 analyze.py path/to/track.mp3

Onset times come from spectral flux mapped to the middle of the two frames it compares; mapping
them to frame starts instead puts every beat about 60 ms early, which is visible at 60 fps.
"""
import json
import subprocess
import sys

import numpy as np

SR, N, HOP = 44100, 1024, 64          # 1.45 ms between onset values
BARS_BEFORE, BARS_AFTER = 2, 16
OUT = 'beats.json'


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def flux_bands(x):
    """Positive spectral flux per band and the time of each value in seconds."""
    win = np.hanning(N).astype(np.float32)
    frames = 1 + (len(x) - N) // HOP
    f = np.fft.rfftfreq(N, 1 / SR)
    bands = {'all': (0, SR / 2), 'low': (20, 150), 'high': (5000, 16000)}
    out = {k: np.zeros(frames - 1, dtype=np.float32) for k in bands}
    prev = None
    for a in range(0, frames, 4096):
        b = min(frames, a + 4096)
        idx = np.arange(N)[None, :] + HOP * np.arange(a, b)[:, None]
        s = np.log1p(100 * np.abs(np.fft.rfft(x[idx] * win, axis=1))).astype(np.float32)
        if prev is not None:
            s = np.vstack([prev, s])
        d = np.maximum(0, np.diff(s, axis=0))
        lo = a - 1 if prev is not None else a
        for k, (fa, fb) in bands.items():
            out[k][lo:lo + len(d)] = d[:, (f >= fa) & (f < fb)].sum(axis=1)
        prev = s[-1:]
    t = (np.arange(frames - 1) * HOP + HOP / 2 + N / 2) / SR
    return t, out


def sync_average(t, env, beats, offs):
    acc = np.zeros(len(offs))
    for b in beats:
        acc += np.interp(b + offs, t, env)
    return acc / len(beats)


def fit_grid(t, env, t_from, t_to):
    """Tempo from autocorrelation, then period and phase that make the beat-synchronous onset peak sharpest."""
    step = 0.005
    grid = np.arange(t_from, t_to, step)
    e = np.interp(grid, t, env)
    e = e - e.mean()
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    lags = np.arange(len(ac)) * step
    ok = (lags > 60 / 180) & (lags < 60 / 120)
    period = lags[ok][np.argmax(ac[ok])]
    best = None
    for p in np.linspace(period * 0.995, period * 1.005, 201):
        for ph in np.arange(0, p, 0.001):
            beats = t_from + ph + p * np.arange(int((t_to - t_from - ph) / p))
            score = np.interp(beats, t, env).mean()
            if best is None or score > best[0]:
                best = (score, p, ph)
    _, p, ph = best
    # refine the phase to the millisecond on the averaged onset shape
    beats = t_from + ph + p * np.arange(int((t_to - t_from - ph) / p))
    offs = np.arange(-0.03, 0.0305, 0.0005)
    ph += offs[np.argmax(sync_average(t, env, beats, offs))]
    return p, (t_from + ph) % p


def main(path):
    x = decode(path)
    dur = len(x) / SR
    t, env = flux_bands(x)

    # the drop: the biggest lasting rise in loudness
    hop = SR // 2
    rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    db = 20 * np.log10(rms + 1e-9)
    w = 16                                              # 8 s either side
    rise = [db[i:i + w].mean() - db[i - w:i].mean() for i in range(w, len(db) - w)]
    rise_t = (w + int(np.argmax(rise))) * 0.5

    period, phase = fit_grid(t, env['all'], rise_t, min(dur - 4, rise_t + 80))
    beat_t = lambda k: phase + k * period
    k_rise = int(round((rise_t - phase) / period))
    # the drop lands with a crash: the beat near the rise with the hardest high-frequency hit
    peak = lambda e, tt: float(np.max(np.interp(tt + np.arange(-0.01, 0.011, 0.001), t, e)))
    k_drop = max(range(k_rise - 6, k_rise + 7), key=lambda k: peak(env['high'], beat_t(k)))
    drop = beat_t(k_drop)
    k0, k1 = k_drop - 4 * BARS_BEFORE, k_drop + 4 * BARS_AFTER
    start, end = beat_t(k0), beat_t(k1)

    strength = lambda tt: peak(env['low'], tt)
    # offbeat eighths that carry a heavy low hit in every repeat of the four-bar loop
    loop = 32
    slot_low = np.zeros(loop)
    for rep in range(BARS_AFTER // 4):
        for s in range(loop):
            slot_low[s] += strength(drop + (rep * loop + s) * period / 2)
    slot_low /= BARS_AFTER // 4
    beat_low = np.median(slot_low[0::2])
    accents = [s for s in range(1, loop, 2) if slot_low[s] > 2.5 * beat_low]

    ref = np.percentile([strength(beat_t(k)) for k in range(k_drop, k1)], 90)
    events = []

    def add(tt, kind, s=None):
        if s is None:
            s = float(np.clip(strength(tt) / ref, 0.35, 1.0))
        events.append({'t': round(tt - start, 5), 's': round(s, 3), 'kind': kind})

    add(start, 'start', 1.0)                             # the pre-drop phrase opens with a hit, then a glide
    for k in range(k0 + 4, k_drop):                      # the build: every beat
        add(beat_t(k), 'beat')
    for k in range(k_drop, k1):
        j = k - k_drop
        if k == k_drop:
            add(beat_t(k), 'drop', 2.0)
        else:
            add(beat_t(k), 'downbeat' if j % 4 == 0 else 'beat')
            if j % 4 == 0:
                events[-1]['s'] = round(min(1.0, events[-1]['s'] + 0.25), 3)
        for s in accents:                                # eighth after this beat
            if (j * 2 + 1) % loop == s:
                add(beat_t(k) + period / 2, 'accent')

    # loudness envelope at 60 fps for the picture to breathe with
    seg = x[int(start * SR): int(end * SR)]
    fh = SR // 60
    env60 = np.array([np.sqrt(np.mean(seg[i:i + fh] ** 2)) for i in range(0, len(seg) - fh + 1, fh)])
    env60 = np.clip(env60 / np.percentile(env60, 95), 0, 1)

    data = {
        'bpm': round(60 / period, 3), 'period': period, 'drop': drop, 'start': start, 'end': end,
        'duration': end - start, 'events': events, 'envelope': [round(float(v), 3) for v in env60],
    }
    with open(OUT, 'w') as fh_:
        json.dump(data, fh_)
    print(f"tempo {60 / period:.2f} BPM, beat {period * 1000:.2f} ms, grid phase {phase:.4f}s")
    print(f"drop at {drop:.3f}s; clip {start:.3f}–{end:.3f}s ({end - start:.2f}s)")
    print(f"{len(events)} hits: {sum(e['kind'] == 'accent' for e in events)} offbeat accents in slots {accents}")
    offs = np.arange(-0.05, 0.0505, 0.001)
    beats = [beat_t(k) for k in range(k_drop, k1)]
    print(f"check: onsets average to a peak {1000 * offs[np.argmax(sync_average(t, env['all'], beats, offs))]:+.0f} ms from the grid")


if __name__ == '__main__':
    main(sys.argv[1])
