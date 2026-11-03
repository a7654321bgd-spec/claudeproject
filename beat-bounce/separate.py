#!/usr/bin/env python3
"""Pulls the vocals out of a stretch of a track with an MDX-Net model (UVR's Kim_Vocal_2.onnx).

    python3 separate.py track.mp3 --start 28.34 --dur 32.64 --model Kim_Vocal_2.onnx --out vocals.wav

The model works on spectrogram chunks: 7680-point STFT, hop 1024, 256 frames, the lowest 3072 bins,
both channels' real and imaginary parts stacked as 4 planes. Chunks overlap by the STFT's own padding,
which is trimmed off before they are joined. Model weights: github.com/TRvlvr/model_repo (releases).
"""
import argparse
import subprocess
import wave

import numpy as np
import onnxruntime as ort

SR, N_FFT, HOP, DIM_F, DIM_T, COMPENSATE = 44100, 7680, 1024, 3072, 256, 1.009
CHUNK = HOP * (DIM_T - 1)
TRIM = N_FFT // 2
GEN = CHUNK - 2 * TRIM
WIN = np.hanning(N_FFT + 1)[:-1].astype(np.float32)       # periodic Hann, as torch.hann_window


def stft(x):        # x: (2, CHUNK) → (2, N_FFT//2+1, DIM_T), centred frames like torch.stft(center=True)
    p = np.pad(x, ((0, 0), (N_FFT // 2, N_FFT // 2)), mode='reflect')
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(DIM_T)[:, None]
    return np.fft.rfft(p[:, idx] * WIN, axis=2).transpose(0, 2, 1)


def istft(S):       # inverse of stft() with window-squared normalisation
    frames = np.fft.irfft(S.transpose(0, 2, 1), n=N_FFT, axis=2) * WIN
    out = np.zeros((2, CHUNK + N_FFT), np.float32)
    norm = np.zeros(CHUNK + N_FFT, np.float32)
    for i in range(DIM_T):
        out[:, i * HOP: i * HOP + N_FFT] += frames[:, i]
        norm[i * HOP: i * HOP + N_FFT] += WIN ** 2
    out /= np.maximum(norm, 1e-8)
    return out[:, N_FFT // 2: N_FFT // 2 + CHUNK]


def separate(mix, model):
    sess = ort.InferenceSession(model)
    n = mix.shape[1]
    pad = GEN - n % GEN
    x = np.concatenate([np.zeros((2, TRIM), np.float32), mix, np.zeros((2, pad + TRIM), np.float32)], axis=1)
    out = []
    for i in range(0, n + pad, GEN):
        S = stft(x[:, i:i + CHUNK])[:, :DIM_F]
        planes = np.stack([S[0].real, S[0].imag, S[1].real, S[1].imag])[None].astype(np.float32)
        V = sess.run(None, {'input': planes})[0][0]
        Vc = np.zeros((2, N_FFT // 2 + 1, DIM_T), np.complex64)
        Vc[0, :DIM_F] = V[0] + 1j * V[1]
        Vc[1, :DIM_F] = V[2] + 1j * V[3]
        out.append(istft(Vc)[:, TRIM:TRIM + GEN])
    return np.concatenate(out, axis=1)[:, :n] * COMPENSATE


def main(track, start, dur, model, out):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', track, '-ac', '2', '-ar', str(SR),
                          '-af', f'atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    mix = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    voc = separate(mix, model)
    pcm = (np.clip(voc.T, -1, 1) * 32767).astype(np.int16)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    r = lambda a: 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)
    print(f"vocals {r(voc):.1f} dBFS from a mix at {r(mix):.1f} dBFS → {out}")


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('track'); ap.add_argument('--start', type=float, required=True); ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--model', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    main(a.track, a.start, a.dur, a.model, a.out)
