"""Original soft-piano score for the reel (60 s, stereo, 44.1 kHz).

0-29 s : slow, sombre A-minor arpeggios (quieter during the title card).
29-60 s: warmer C-major arpeggios with a gentle melody and pad, rising, then
         a final sustained chord that fades out.
"""
import wave

import numpy as np

SR = 44100
DUR = 60.0


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def piano(freq, dur, vel):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    damp = (freq / 261.6) ** 0.35
    for h in range(1, 8):
        fh = freq * h * np.sqrt(1 + 0.0004 * h * h)
        if fh > SR / 2.2:
            break
        out += (1 / h ** 1.4) * np.sin(2 * np.pi * fh * t) * np.exp(-t * (0.8 + 0.5 * h) * damp)
    out *= 1 - np.exp(-t / 0.004)
    rel = min(int(0.25 * SR), n)
    out[-rel:] *= np.linspace(1, 0, rel)
    return out * vel


def pad(freqs, dur, vel):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t + 0.5) for f in freqs)
    env = np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 1.5)
    return out * env * vel


CHORDS = {
    "Am": [57, 60, 64], "F": [53, 57, 60], "C": [48, 52, 55], "G": [55, 59, 62],
    "E": [52, 56, 59], "Dm": [50, 53, 57],
}


def build():
    n = int(DUR * SR)
    L = np.zeros(n + SR * 6)
    R = np.zeros(n + SR * 6)

    def add(sig, start, pan=0.0):
        i = int(start * SR)
        gl, gr = np.sqrt(0.5 - pan / 2), np.sqrt(0.5 + pan / 2)
        L[i:i + len(sig)] += sig * gl
        R[i:i + len(sig)] += sig * gr

    # Section A: sombre
    prog_a = [(0, "Am"), (4, "F"), (8, "C"), (12, "G"), (16, "Am"), (20, "F"), (24, "E")]
    for start, ch in prog_a:
        notes = CHORDS[ch]
        quiet = 0.7 if 13 <= start < 21 else 1.0
        add(piano(midi(notes[0] - 12), 4.5, 0.42 * quiet), start, -0.2)
        arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24]
        end = 29 if start == 24 else start + 4
        k = 0
        while start + k * (4 / 6) < end - 0.1:
            m = arp[k % len(arp)]
            add(piano(midi(m), 3.0, 0.22 * quiet * (0.85 + 0.15 * (k % 2 == 0))), start + k * (4 / 6),
                (m - 72) / 30)
            k += 1

    # Section B: warm, hopeful
    prog_b = [(29, "C"), (33, "G"), (37, "Am"), (41, "F"), (45, "C"), (49, "G"), (53, "F")]
    melody = [76, 74, 72, 74, 79, 77, 76, 74, 72, 71, 72, 76, 77, 76, 74, 72, 76, 79, 81, 79,
              77, 76, 74, 76, 72, 74, 79, 77]
    mi = 0
    for idx, (start, ch) in enumerate(prog_b):
        notes = CHORDS[ch]
        grow = 0.75 + 0.35 * idx / len(prog_b)
        add(piano(midi(notes[0] - 12), 4.5, 0.45 * grow), start, -0.25)
        add(pad([midi(x) for x in notes], 4.4, 0.012 * grow), start - 0.2, 0.0)
        arp = [notes[0] + 12, notes[2] + 12, notes[1] + 24, notes[2] + 12] * 2
        for k, m in enumerate(arp):
            add(piano(midi(m), 2.5, 0.17 * grow), start + k * 0.5, (m - 72) / 30)
        for b in range(4):
            if b % 2 == 0 or idx >= 3:
                add(piano(midi(melody[mi % len(melody)]), 2.5, 0.26 * grow), start + b + 0.02, 0.15)
                mi += 1

    # Final chord (rolled), sustained to the end
    for j, m in enumerate([48, 55, 60, 64, 67, 72, 76]):
        add(piano(midi(m), 4.0, 0.3), 56.0 + j * 0.06, (m - 64) / 30)
    add(pad([midi(60), midi(64), midi(67)], 4.0, 0.015), 56.0)

    dry = np.stack([L[:n], R[:n]])

    # Convolution reverb with a synthetic decaying-noise impulse response
    rng = np.random.default_rng(7)
    ir_len = int(2.8 * SR)
    ti = np.arange(ir_len) / SR
    wet = np.zeros_like(dry)
    size = 1 << int(np.ceil(np.log2(n + ir_len)))
    for c in range(2):
        ir = rng.standard_normal(ir_len) * np.exp(-ti / 0.55)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        wet[c] = np.fft.irfft(np.fft.rfft(dry[c], size) * np.fft.rfft(ir, size), size)[:n]
    mix = dry + 0.35 * wet

    t = np.arange(n) / SR
    fade = np.minimum(1, t / 0.6) * np.clip((DUR - t) / 2.0, 0, 1)
    mix *= fade
    mix /= np.abs(mix).max() / 0.8
    return mix


def write_wav(path, stereo):
    data = (np.clip(stereo.T, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    import sys

    write_wav(sys.argv[1] if len(sys.argv) > 1 else "music.wav", build())
