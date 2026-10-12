import json, math, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
SRC = '/root/.claude/uploads/69783912-59e6-5d49-a481-741ac2d60c88/fff1b0ea-image.png'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'reel.mp4'

BN_B = '/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf'
BN_R = '/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf'
LA_B = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'
LA_R = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'

GREEN_D = (6, 52, 45)
GREEN = (11, 84, 70)
GOLD = (245, 196, 40)
WHITE = (255, 255, 255)
INK = (24, 38, 35)
MUTED = (225, 236, 232)

from fontTools.ttLib import TTFont
BN_CMAP = set(TTFont(BN_B).getBestCmap())
_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)
    return _fc[k]

# ---------- mixed Bengali / Latin text ----------
LATIN = re.compile(r'[A-Za-z0-9&().,\'’/+:-]+')

def runs(word):
    """Split a word into (text, is_latin) runs."""
    out, i = [], 0
    for m in LATIN.finditer(word):
        if m.start() > i:
            out.append((word[i:m.start()], False))
        out.append((m.group(), True))
        i = m.end()
    if i < len(word):
        out.append((word[i:], False))
    res = []
    for t, lat in out:
        lat = lat and bool(re.search(r'[A-Za-z0-9]', t))
        if not lat:  # split off chars the Bengali font lacks
            buf = ''
            for ch in t:
                if ord(ch) not in BN_CMAP:
                    if buf: res.append((buf, False)); buf = ''
                    res.append((ch, True))
                else:
                    buf += ch
            if buf: res.append((buf, False))
        else:
            res.append((t, True))
    return res

def fonts_for(size, bold):
    return (font(BN_B if bold else BN_R, size), font(LA_B if bold else LA_R, int(size * 0.92)))

def word_width(word, size, bold):
    bn, la = fonts_for(size, bold)
    return sum((la if lat else bn).getlength(t) for t, lat in runs(word))

def wrap(text, size, bold, maxw):
    lines = []
    for para in text.split('\n'):
        cur, cw = [], 0
        sp = fonts_for(size, bold)[0].getlength(' ')
        for w in para.split(' '):
            ww = word_width(w, size, bold)
            if cur and cw + sp + ww > maxw:
                lines.append(' '.join(cur)); cur, cw = [w], ww
            else:
                cw = cw + sp + ww if cur else ww; cur.append(w)
        lines.append(' '.join(cur))
    return lines

def line_width(line, size, bold):
    sp = fonts_for(size, bold)[0].getlength(' ')
    ws = line.split(' ')
    return sum(word_width(w, size, bold) for w in ws) + sp * (len(ws) - 1)

def draw_line(d, x, y, line, size, bold, fill):
    bn, la = fonts_for(size, bold)
    sp = bn.getlength(' ')
    for w in line.split(' '):
        for t, lat in runs(w):
            f = la if lat else bn
            d.text((x, y + (size * 0.06 if lat else 0)), t, font=f, fill=fill)
            x += f.getlength(t)
        x += sp

def text_block(text, size, bold, fill, maxw, align='left', lh=1.55):
    lines = wrap(text, size, bold, maxw)
    lhp = int(size * lh)
    img = Image.new('RGBA', (maxw, lhp * len(lines) + int(size * 0.5)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, ln in enumerate(lines):
        lw = line_width(ln, size, bold)
        x = {'left': 0, 'center': (maxw - lw) / 2, 'right': maxw - lw}[align]
        draw_line(d, x, i * lhp, ln, size, bold, fill)
    return img

# ---------- assets ----------
src = Image.open(SRC).convert('RGB')
logo = src.crop((760, 30, 1200, 185))


def circle_photo(box, size, ring=10):
    p = src.crop(box).resize((size, size), Image.LANCZOS)
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size + 2 * ring, size + 2 * ring), (0, 0, 0, 0))
    rm = Image.new('L', ((size + 2 * ring) * 4,) * 2, 0)
    ImageDraw.Draw(rm).ellipse((0, 0, (size + 2 * ring) * 4 - 1, (size + 2 * ring) * 4 - 1), fill=255)
    rm = rm.resize((size + 2 * ring,) * 2, Image.LANCZOS)
    out.paste(Image.new('RGBA', out.size, GOLD + (255,)), (0, 0), rm)
    out.paste(p, (ring, ring), m)
    return out

def rounded(img, r, bg=None):
    w, h = img.size
    m = Image.new('L', (w * 3, h * 3), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 3 - 1, h * 3 - 1), r * 3, fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(img.convert('RGBA'), (0, 0), m)
    return out

def card(w, h, color=(255, 255, 255, 255), r=36):
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(c).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=color)
    return c

def shadow(img, blur=24, alpha=110, off=(0, 14)):
    pad = blur * 2
    s = Image.new('RGBA', (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    a = img.split()[3].point(lambda v: v * alpha // 255)
    s.paste(Image.new('RGBA', img.size, (0, 0, 0, 255)), (pad, pad), a)
    s = s.filter(ImageFilter.GaussianBlur(blur))
    return s, (off[0] - pad, off[1] - pad)

def make_bg():
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    t = np.clip(0.55 * y + 0.25 * x, 0, 1)[..., None]
    a = np.array(GREEN, float); b = np.array(GREEN_D, float)
    arr = (a * (1 - t) + b * t).astype(np.uint8)
    bg = Image.fromarray(arr).convert('RGBA')
    d = ImageDraw.Draw(bg)
    # soft decorative rings
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    od.ellipse((-380, -300, 520, 600), outline=(255, 255, 255, 22), width=3)
    od.ellipse((700, 1350, 1500, 2150), outline=(245, 196, 40, 40), width=4)
    od.ellipse((760, 1410, 1440, 2090), outline=(255, 255, 255, 18), width=2)
    bg = Image.alpha_composite(bg, ov)
    return bg

BG = make_bg()
LOGO_CARD = rounded(Image.new('RGB', (520, 190), WHITE), 30)
lg = logo.resize((480, int(480 * logo.height / logo.width)), Image.LANCZOS)
LOGO_CARD.paste(lg, (20, (190 - lg.height) // 2))
LOGO_CARD = rounded(LOGO_CARD, 30)

AVATAR = circle_photo((250, 50, 570, 370), 210, ring=8)
BIG_PHOTO = circle_photo((235, 30, 615, 410), 560, ring=14)

FOOTER = text_block('জ্ঞান  •  নৈতিকতা  •  দক্ষতা  •  আত্মনির্ভরতা', 38, True, GOLD, 960, 'center')

def gold_pill(text, size=40, pad=(34, 14), fg=GREEN_D, bg=GOLD):
    tb = text_block(text, size, True, fg, int(line_width(text, size, True)) + 4, 'left', lh=1.35)
    p = card(tb.width + pad[0] * 2, tb.height + pad[1], bg + (255,), r=(tb.height + pad[1]) // 2)
    p.alpha_composite(tb, (pad[0], pad[1] // 2 + 4))
    return p

def badge(n):
    s = 150
    b = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(b).ellipse((0, 0, s - 1, s - 1), fill=GOLD + (255,))
    t = text_block(n, 66, True, GREEN_D, s, 'center', lh=1.2)
    b.alpha_composite(t, (0, (s - t.height) // 2 + 6))
    return b

# ---------- slide content ----------
SLIDES = [
    dict(kind='intro',
         voice='জ্ঞানবৃত্ত লার্নিং এন্ড ডেভেলপমেন্ট সেন্টার। স্বপ্নদ্রষ্টা প্রতিষ্ঠাতার কথা। নাসিম ইকবাল, প্রতিষ্ঠাতা ও প্রধান নির্বাহী।'),
    dict(kind='point', n='০১', title='শিক্ষাজীবনের শুরু',
         chips=['Jhenaidah Cadet College'],
         body='একজন former cadet of Jhenaidah Cadet College হিসেবে তাঁর শিক্ষাজীবনের শুরুতেই শৃঙ্খলা, নেতৃত্ব ও উৎকর্ষের পরিবেশের সঙ্গে পরিচয় ঘটে।',
         voice='ঝিনাইদহ ক্যাডেট কলেজের একজন সাবেক ক্যাডেট হিসেবে, শিক্ষাজীবনের শুরুতেই তাঁর পরিচয় ঘটে শৃঙ্খলা, নেতৃত্ব ও উৎকর্ষের পরিবেশের সঙ্গে।'),
    dict(kind='point', n='০২', title='কৃতিত্বপূর্ণ ফলাফল',
         chips=['SSC — মেধাক্রম ১৫তম', 'HSC — মেধাক্রম ৫ম', 'ঢাবি ভর্তি পরীক্ষা — ৯ম স্থান (B unit)'],
         body='SSC ও HSC পর্যায়ে কৃতিত্বের সঙ্গে উত্তীর্ণ হয়ে তিনি ঢাকা বিশ্ববিদ্যালয়ের ভর্তি পরীক্ষায় ৯ম স্থান (B\u00a0unit) অর্জন করেন।',
         voice='এসএসসিতে মেধাক্রমে পনেরোতম, এবং এইচএসসিতে মেধাক্রমে পঞ্চম হয়ে কৃতিত্বের সঙ্গে উত্তীর্ণ হন। এরপর ঢাকা বিশ্ববিদ্যালয়ের ভর্তি পরীক্ষায়, বি ইউনিটে, নবম স্থান অর্জন করেন।'),
    dict(kind='point', n='০৩', title='শিক্ষকতায় যাত্রা',
         chips=['Milestone College', 'ইংরেজি বিভাগ — লেকচারার'],
         body='পরবর্তীতে উচ্চশিক্ষা শেষে Milestone College-এ ইংরেজি বিভাগের লেকচারার পদে যোগদান করেন।',
         voice='উচ্চশিক্ষা শেষে তিনি মাইলস্টোন কলেজের ইংরেজি বিভাগে প্রভাষক পদে যোগদান করেন।'),
    dict(kind='point', n='০৪', title='বিসিএস ও প্রত্যাবর্তন',
         chips=['২৮তম BCS', 'উপজেলা শিক্ষা কর্মকর্তা'],
         body='২৮তম BCS-এর মাধ্যমে উপজেলা শিক্ষা কর্মকর্তা হিসেবে স্বল্পসময়ে কর্মরত ছিলেন। এরপর আবারও Milestone College-এ শিক্ষকতা করেন।',
         voice='আটাশতম বিসিএসের মাধ্যমে তিনি উপজেলা শিক্ষা কর্মকর্তা হিসেবে স্বল্প সময় কর্মরত ছিলেন। এরপর আবারও মাইলস্টোন কলেজে শিক্ষকতায় ফিরে আসেন।'),
    dict(kind='point', n='০৫', title='একাডেমিক নেতৃত্ব',
         chips=['Assistant Professor', 'Chief Coordinator'],
         body='শিক্ষাক্ষেত্রে বিভিন্ন সময়ে তিনি শিক্ষকতা ও একাডেমিক নেতৃত্বের বিভিন্ন দায়িত্ব পালন করেন। Milestone College-এর Assistant Professor এবং Chief Coordinator হিসেবেও দায়িত্ব পালন করেছেন।',
         voice='শিক্ষাক্ষেত্রে বিভিন্ন সময়ে তিনি শিক্ষকতা ও একাডেমিক নেতৃত্বের নানা দায়িত্ব পালন করেছেন। মাইলস্টোন কলেজের সহকারী অধ্যাপক এবং চিফ কোঅর্ডিনেটর হিসেবেও তিনি দায়িত্ব পালন করেছেন।'),
    dict(kind='point', n='০৬', title='বর্তমান দায়িত্ব',
         chips=['Academic Head', 'Bangladesh School Saham, Oman'],
         body='বর্তমানে Bangladesh School Saham, Oman-এ Academic Head হিসেবে একাডেমিক নেতৃত্ব ও শিক্ষাব্যবস্থাপনায় কাজ করছেন।',
         voice='বর্তমানে তিনি ওমানের বাংলাদেশ স্কুল সাহামে একাডেমিক হেড হিসেবে, একাডেমিক নেতৃত্ব ও শিক্ষাব্যবস্থাপনায় কাজ করছেন।'),
    dict(kind='outro',
         voice='জ্ঞান, নৈতিকতা, দক্ষতা, আত্মনির্ভরতা। জ্ঞানবৃত্ত, লার্নিং এন্ড ডেভেলপমেন্ট সেন্টার।'),
]

# ---------- voiceover ----------
def synth_all():
    import sherpa_onnx
    d = 'vits-coqui-bn-custom_female'
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{d}/model.onnx', tokens=f'{d}/tokens.txt'), num_threads=4))
    tts = sherpa_onnx.OfflineTts(cfg)
    clips = []
    for s in SLIDES:
        a = tts.generate(s['voice'], sid=0, speed=0.95)
        clips.append((np.array(a.samples, np.float32), a.sample_rate))
    return clips

def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3

def place(frame, layer, x, y, t, delay, dy=60):
    p = ease((t - delay) / 0.55)
    if p <= 0:
        return
    l = layer
    if p < 1:
        l = layer.copy(); l.putalpha(l.split()[3].point(lambda v: int(v * p)))
    frame.alpha_composite(l, (int(x), int(y + dy * (1 - p))))

def build_layers(s):
    L = {}
    if s['kind'] == 'point':
        L['badge'] = badge(s['n'])
        L['title'] = text_block(s['title'], 80, True, WHITE, 760, 'left', lh=1.4)
        L['chips'] = [gold_pill(c, 46) for c in s['chips']]
        body = text_block(s['body'], 52, False, INK, 850, 'left', lh=1.6)
        c = card(940, body.height + 90)
        ImageDraw.Draw(c).rounded_rectangle((0, 0, 12, c.height - 1), 6, fill=GOLD + (255,))
        c.alpha_composite(body, (50, 48))
        L['card'] = c
        L['card_sh'] = shadow(c)
    elif s['kind'] == 'intro':
        L['tag'] = gold_pill('স্বপ্নদ্রষ্টা প্রতিষ্ঠাতার কথা', 54, pad=(44, 20))
        L['name'] = text_block('নাসিম ইকবাল', 118, True, WHITE, 1000, 'center', lh=1.35)
        L['role'] = gold_pill('Founder & CEO', 46, pad=(40, 16), fg=WHITE, bg=(9, 70, 60))
        L['org'] = text_block('জ্ঞানবৃত্ত — Learning & Development Center', 40, False, MUTED, 1000, 'center')
    else:
        L['values'] = circle_photo((437 - 228, 962 - 228, 437 + 228, 962 + 228), 640, ring=12)
        L['head'] = text_block('আমাদের মূল্যবোধ', 72, True, WHITE, 1000, 'center', lh=1.35)
        L['words'] = text_block('জ্ঞান  •  নৈতিকতা  •  দক্ষতা  •  আত্মনির্ভরতা', 48, True, GOLD, 1000, 'center')
        L['org'] = text_block('জ্ঞানবৃত্ত — Learning & Development Center', 40, False, MUTED, 1000, 'center')
    return L

def render(s, L, t, dur, idx):
    f = BG.copy()
    if s['kind'] == 'intro':
        place(f, LOGO_CARD, (W - LOGO_CARD.width) // 2, 130, t, 0.0, dy=-40)
        z = 1 + 0.04 * (t / dur)
        ph = BIG_PHOTO.resize((int(BIG_PHOTO.width * z),) * 2, Image.LANCZOS)
        place(f, ph, (W - ph.width) // 2, 400 - (ph.height - BIG_PHOTO.height) // 2, t, 0.25)
        place(f, L['tag'], (W - L['tag'].width) // 2, 1040, t, 0.7)
        place(f, L['name'], 40, 1180, t, 1.1)
        place(f, L['role'], (W - L['role'].width) // 2, 1370, t, 1.5)
        place(f, L['org'], 40, 1490, t, 1.8)
    elif s['kind'] == 'point':
        place(f, LOGO_CARD.resize((390, 142), Image.LANCZOS), 70, 110, t, 0.0, dy=-30)
        place(f, AVATAR, W - AVATAR.width - 70, 80, t, 0.1, dy=-30)
        ch = sum(c.height + 22 for c in L['chips'])
        total = 190 + ch + 40 + L['card'].height
        y0 = int(400 + (1700 - 400 - total) / 2)
        place(f, L['badge'], 70, y0, t, 0.2)
        place(f, L['title'], 250, y0 + 20, t, 0.35)
        y = y0 + 190
        for i, c in enumerate(L['chips']):
            place(f, c, 70, y, t, 0.6 + 0.25 * i, dy=40)
            y += c.height + 22
        y += 40
        sh, off = L['card_sh']
        place(f, sh, 70 + off[0], y + off[1], t, 0.6 + 0.25 * len(L['chips']) + 0.2)
        place(f, L['card'], 70, y, t, 0.6 + 0.25 * len(L['chips']) + 0.2)
    else:
        place(f, LOGO_CARD, (W - LOGO_CARD.width) // 2, 150, t, 0.0, dy=-40)
        place(f, L['head'], 40, 430, t, 0.3)
        place(f, L['values'], (W - L['values'].width) // 2, 600, t, 0.6)
        place(f, L['words'], 40, 1340, t, 1.0)
        place(f, L['org'], 40, 1450, t, 1.3)
    # footer & progress
    if s['kind'] != 'outro':
        f.alpha_composite(FOOTER, ((W - FOOTER.width) // 2, 1740))
    d = ImageDraw.Draw(f)
    n = len(SLIDES)
    seg = (W - 140 - (n - 1) * 10) / n
    for i in range(n):
        x0 = 70 + i * (seg + 10)
        d.rounded_rectangle((x0, 1850, x0 + seg, 1858), 4, fill=(255, 255, 255, 60))
        fill = 1.0 if i < idx else (min(1, t / dur) if i == idx else 0)
        if fill > 0:
            d.rounded_rectangle((x0, 1850, x0 + seg * fill, 1858), 4, fill=GOLD + (255,))
    return f

def main():
    clips = synth_all()
    sr = clips[0][1]
    LEAD, TAIL = 0.6, 0.8  # silence before/after narration per slide
    durs, audio = [], []
    for samples, _ in clips:
        dur = LEAD + len(samples) / sr + TAIL
        durs.append(dur)
        seg = np.zeros(int(round(dur * FPS)) * sr // FPS, np.float32)
        a0 = int(LEAD * sr)
        seg[a0:a0 + len(samples)] = samples[: len(seg) - a0]
        audio.append(seg)
    audio = np.concatenate(audio)
    audio = audio / max(1e-6, np.abs(audio).max()) * 0.89
    sf.write('voice.wav', audio, sr)
    print('durations', [round(x, 2) for x in durs], 'total', round(sum(durs), 2))

    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                           '-r', str(FPS), '-i', '-', '-i', 'voice.wav', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT],
                          stdin=subprocess.PIPE)
    prev_last = None
    XF = 0.35
    for idx, s in enumerate(SLIDES):
        L = build_layers(s)
        nf = int(round(durs[idx] * FPS))
        last = None
        for k in range(nf):
            t = k / FPS
            fr = render(s, L, t, durs[idx], idx).convert('RGB')
            if prev_last is not None and t < XF:
                fr = Image.blend(prev_last, fr, t / XF)
            ff.stdin.write(fr.tobytes())
            last = fr
        prev_last = last
        print('slide', idx + 1, 'done', flush=True)
    ff.stdin.close(); ff.wait()

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[2] == 'preview':
        for i, s in enumerate(SLIDES):
            render(s, build_layers(s), 99, 100, i).convert('RGB').save(f'prev_{i}.png')
    else:
        main()
