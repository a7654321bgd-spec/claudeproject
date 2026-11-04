#!/usr/bin/env python3
"""Beat analysis for the beat-bounce video.

Fits the beat grid to the track, finds the drop, cuts the clip (by default two bars before the drop
and sixteen after) and picks the moments the square hits a wall. Writes beats.json for build.js.

    python3 analyze.py path/to/track.mp3
    python3 analyze.py track.mp3 --out jealous.json --drop 7.5 --before 4 --after 8

Onset times come from spectral flux mapped to the middle of the two frames it compares; mapping
them to frame starts instead puts every beat about 60 ms early, which is visible at 60 fps.
"""
import argparse
import json
import subprocess

import numpy as np

SR, N, HOP = 44100, 1024, 64          # 1.45 ms between onset values


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


def fit_grid(t, env, t_from, t_to, bpm=None):
    """Tempo from autocorrelation, then period and phase that make the beat-synchronous onset peak sharpest."""
    step = 0.005
    grid = np.arange(t_from, t_to, step)
    e = np.interp(grid, t, env)
    e = e - e.mean()
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    lags = np.arange(len(ac)) * step
    ok = (lags > 60 / 180) & (lags < 60 / 120)
    period = lags[ok][np.argmax(ac[ok])] if bpm is None else 60 / bpm   # a known tempo skips the estimate
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


def main(path, out='beats.json', drop_hint=None, bars_before=2, bars_after=16, finest=16, bpm=None):
    x = decode(path)
    dur = len(x) / SR
    t, env = flux_bands(x)

    if drop_hint is None:
        # the drop: the biggest lasting rise in loudness
        hop = SR // 2
        rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
        db = 20 * np.log10(rms + 1e-9)
        w = 16                                          # 8 s either side
        rise = [db[i:i + w].mean() - db[i - w:i].mean() for i in range(w, len(db) - w)]
        rise_t = (w + int(np.argmax(rise))) * 0.5
    else:
        rise_t = drop_hint

    period, phase = fit_grid(t, env['all'], rise_t, min(dur - 4, rise_t + 80), bpm)
    beat_t = lambda k: phase + k * period
    k_rise = int(round((rise_t - phase) / period))
    peak = lambda e, tt: float(np.max(np.interp(tt + np.arange(-0.01, 0.011, 0.001), t, e)))
    if drop_hint is None:
        # the drop lands with a crash: the beat near the rise with the hardest high-frequency hit
        k_drop = max(range(k_rise - 6, k_rise + 7), key=lambda k: peak(env['high'], beat_t(k)))
    else:
        k_drop = k_rise
    drop = beat_t(k_drop)
    k0, k1 = k_drop - 4 * bars_before, k_drop + 4 * bars_after
    # a slightly wrong tempo drifts by the time it reaches the clip: re-centre the grid on the clip's
    # own onsets (period and phase), leaving well-fitted grids alone
    offs = np.arange(-0.1, 0.1005, 0.0005)
    shift = offs[np.argmax(sync_average(t, env['all'], [beat_t(k) for k in range(k_drop, k1)], offs))]
    if abs(shift) > 0.01:
        t_drop = beat_t(k_drop) + shift
        best = max(((sync_average(t, env['all'], [t_drop + p * j for j in range(k1 - k_drop)], [0.0])[0], p)
                    for p in np.linspace(period * 0.997, period * 1.003, 121)))
        period, phase = best[1], t_drop % best[1]
        k_drop = int(round((t_drop - phase) / period))
        k0, k1 = k_drop - 4 * bars_before, k_drop + 4 * bars_after
        print(f"grid re-centred on the clip by {1000 * shift:+.0f} ms")
    drop = beat_t(k_drop)
    start, end = beat_t(k0), beat_t(k1)

    strength = lambda tt: peak(env['low'], tt)
    ref_low = np.percentile([strength(beat_t(k)) for k in range(k_drop, k1)], 90)
    events = []

    def add(tt, kind, s):
        if events and tt - start <= events[-1]['t'] + 1e-6:
            return                                       # one hit per moment (the clip may open on the build bar)
        events.append({'t': round(tt - start, 5), 's': round(float(s), 3), 'kind': kind})

    # Every beat is a hit; between beats, an eighth or sixteenth is a hit when the drums really
    # sound there (measured against the beats of the same bar). The bar is stricter in the first half
    # of the drop than in the second, so the square gets busier as the track goes on.
    add(start, 'start', 1.0)                             # the pre-drop phrase opens with a hit
    # earlier bars before the drop: a hit on each beat that clearly sounds (a vocal count-in, say),
    # a glide through the quiet ones
    beat_ref = np.median([peak(env['all'], beat_t(k)) for k in range(k_drop, k1)])
    for k in range(k0 + 1, k_drop - 4):
        if peak(env['all'], beat_t(k)) >= 0.45 * beat_ref:
            add(beat_t(k), 'beat', 0.5)
    sixteenth = period / 4
    for bar in range(-1, bars_after):                    # bar -1 is the build just before the drop
        b0 = drop + bar * 4 * period
        rel = [peak(env['all'], b0 + k * sixteenth) for k in range(16)]
        ref = np.median(rel[0::4])
        rel = [v / ref for v in rel]
        bar_low = 0.85 if bar < bars_after // 2 else 0.7
        for k in range(16):
            tt, low = b0 + k * sixteenth, strength(b0 + k * sixteenth) / ref_low
            if k % 4 == 0:
                if bar == 0 and k == 0:
                    add(tt, 'drop', 2.0)
                elif k == 0 and bar > 0 and rel[k] > 2.5:
                    add(tt, 'impact', 1.6)               # a second crash as big as the drop's
                else:
                    s = np.clip(low, 0.35, 1.0) + (0.25 if k == 0 else 0)
                    add(tt, 'downbeat' if k == 0 else 'beat', min(1.0, s))
            elif rel[k] >= bar_low and (finest == 16 or k % 2 == 0):
                if low >= 0.8:
                    add(tt, 'accent', np.clip(low, 0.6, 1.0))   # a heavy 808 off the beat
                else:
                    add(tt, 'eighth' if k % 2 == 0 else 'sixteenth', np.clip(0.2 + 0.3 * rel[k], 0.3, 0.7))

    # loudness and bass envelopes at 60 fps for the picture to breathe with
    seg = x[int(start * SR): int(end * SR)]
    spec = np.fft.rfft(seg)
    spec[np.fft.rfftfreq(len(seg), 1 / SR) > 150] = 0
    bass = np.fft.irfft(spec, len(seg))
    fh = SR // 60
    frames60 = lambda sig: np.array([np.sqrt(np.mean(sig[i:i + fh] ** 2)) for i in range(0, len(sig) - fh + 1, fh)])
    norm = lambda a: np.clip(a / np.percentile(a, 95), 0, 1)
    env60, bass60 = norm(frames60(seg)), norm(frames60(bass))

    data = {
        'bpm': round(60 / period, 3), 'period': period, 'drop': drop, 'start': start, 'end': end,
        'duration': end - start, 'events': events,
        'envelope': [round(float(v), 3) for v in env60], 'bass': [round(float(v), 3) for v in bass60],
    }
    with open(out, 'w') as fh_:
        json.dump(data, fh_)
    print(f"tempo {60 / period:.2f} BPM, beat {period * 1000:.2f} ms, grid phase {phase:.4f}s")
    print(f"drop at {drop:.3f}s; clip {start:.3f}–{end:.3f}s ({end - start:.2f}s)")
    kinds = {k: sum(e['kind'] == k for e in events) for k in ('beat', 'downbeat', 'eighth', 'sixteenth', 'accent', 'impact')}
    print(f"{len(events)} hits: {kinds}")
    offs = np.arange(-0.05, 0.0505, 0.001)
    beats = [beat_t(k) for k in range(k_drop, k1)]
    print(f"check: onsets average to a peak {1000 * offs[np.argmax(sync_average(t, env['all'], beats, offs))]:+.0f} ms from the grid")


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('track')
    ap.add_argument('--out', default='beats.json')
    ap.add_argument('--drop', type=float, help='seconds into the track where the drop lands (found automatically if left out)')
    ap.add_argument('--before', type=int, default=2, help='bars of the clip before the drop')
    ap.add_argument('--after', type=int, default=16, help='bars of the clip from the drop on')
    ap.add_argument('--finest', type=int, default=16, choices=(8, 16), help='shortest note that can be a hit: 8 for busy hi-hats')
    ap.add_argument('--bpm', type=float, help='the tempo, when the automatic estimate gets it wrong')
    a = ap.parse_args()
    main(a.track, a.out, a.drop, a.before, a.after, a.finest, a.bpm)
