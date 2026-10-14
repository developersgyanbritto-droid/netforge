"""Render the reel "শৃঙ্খলা শেখাচ্ছি, নাকি অপমান করছি?" (9:16, 60 s, 30 fps).

Usage:
    python3 make_reel.py                     # full render -> out/reel.mp4
    python3 make_reel.py --no-captions       # without burned-in subtitles
    python3 make_reel.py --preview 3 8 15    # write PNG stills of those seconds

Optional assets (drop into ./assets and re-run):
    founder.jpg / founder.png   founder's photo for scene 7
    logo.png                    Gyanbritto logo shown in scene 8
    voice.wav / voice.mp3       recorded voice-over, mixed over the music
"""
import argparse
import math
import os
import subprocess
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import music

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
ASSETS = os.path.join(HERE, "assets")
W, H, FPS, DUR = 1080, 1920, 30, 60.0
K = 2  # supersampling factor for illustrations


def font(name, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", name + ".ttf"), size)


def asset(*names):
    for n in names:
        p = os.path.join(ASSETS, n)
        if os.path.exists(p):
            return p
    return None


# ---------------------------------------------------------------- helpers
def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def ramp(t, a, b):
    return ease((t - a) / (b - a))


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Pen:
    """ImageDraw wrapper that works in final-pixel coordinates on a K-times canvas."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def e(self, x, y, rx, ry, fill, outline=None, w=0):
        self.d.ellipse([K * (x - rx), K * (y - ry), K * (x + rx), K * (y + ry)], fill=fill,
                       outline=outline, width=int(K * w))

    def rr(self, x0, y0, x1, y1, r, fill):
        self.d.rounded_rectangle([K * x0, K * y0, K * x1, K * y1], radius=K * r, fill=fill)

    def ln(self, pts, fill, w):
        self.d.line([(K * x, K * y) for x, y in pts], fill=fill, width=int(K * w), joint="curve")
        for x, y in (pts[0], pts[-1]):
            self.e(x, y, w / 2, w / 2, fill)

    def arc(self, x0, y0, x1, y1, a0, a1, fill, w):
        self.d.arc([K * x0, K * y0, K * x1, K * y1], a0, a1, fill=fill, width=int(K * w))

    def poly(self, pts, fill):
        self.d.polygon([(K * x, K * y) for x, y in pts], fill=fill)

    def pie(self, x0, y0, x1, y1, a0, a1, fill):
        self.d.pieslice([K * x0, K * y0, K * x1, K * y1], a0, a1, fill=fill)

    def text(self, xy, s, f, fill, anchor="mm"):
        self.d.text((K * xy[0], K * xy[1]), s, font=f, fill=fill, anchor=anchor)


def canvas(color=(0, 0, 0, 0), w=W, h=H):
    return Image.new("RGBA", (w * K, h * K), color)


def down(img, w=W, h=H):
    return img.resize((w, h), Image.LANCZOS)


def vgrad(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None, None]
    arr = np.array(top)[None, None] * (1 - t) + np.array(bottom)[None, None] * t
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8)).convert("RGBA")


def radial(w, h, cx, cy, r, color, alpha):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2 * alpha
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., :3] = color
    arr[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


SKIN = (206, 152, 112)
HAIR = (38, 27, 22)
INK = (54, 36, 30)


# ---------------------------------------------------------------- characters
def child(p, cx, fy, sc=1.0, pose="down", mood="listen", head_dy=0, look=0,
          shirt=(236, 240, 247), pants=(46, 60, 104), skin=SKIN, hair=HAIR):
    """Draw a schoolchild standing with feet at (cx, fy). Returns anchor points."""

    def X(x):
        return cx + x * sc

    def Y(y):
        return fy + y * sc

    def e(x, y, rx, ry, fill):
        p.e(X(x), Y(y), rx * sc, ry * sc, fill)

    def rr(x0, y0, x1, y1, r, fill):
        p.rr(X(x0), Y(y0), X(x1), Y(y1), r * sc, fill)

    def ln(pts, fill, w):
        p.ln([(X(x), Y(y)) for x, y in pts], fill, w * sc)

    def arc(x0, y0, x1, y1, a0, a1, fill, w):
        p.arc(X(x0), Y(y0), X(x1), Y(y1), a0, a1, fill, w * sc)

    hy = -548 + head_dy
    down_face = mood in ("down", "teary")
    fo = 16 if down_face else 0
    ey = hy + 14 + fo
    sk_d = shade(skin, 0.86)

    # legs & shoes
    rr(-50, -180, -14, -20, 12, skin)
    rr(14, -180, 50, -20, 12, skin)
    rr(-50, -62, -14, -24, 6, (245, 245, 245))
    rr(14, -62, 50, -24, 6, (245, 245, 245))
    e(-36, -16, 34, 15, (32, 30, 36))
    e(36, -16, 34, 15, (32, 30, 36))
    rr(-70, -268, 70, -150, 18, pants)
    rr(-3, -200, 3, -150, 2, shade(pants, 0.75))
    # torso
    rr(-82, -444, 82, -240, 42, shirt)
    rr(-82, -262, 82, -240, 6, shade(pants, 0.9))
    for by in (-395, -350, -305):
        e(0, by, 4, 4, shade(shirt, 0.8))
    rr(30, -395, 62, -362, 5, shade(shirt, 0.92))
    rr(-18, -478, 18, -430, 8, sk_d)
    p.poly([(X(-40), Y(-446)), (X(0), Y(-420)), (X(-6), Y(-400)), (X(-46), Y(-432))], shade(shirt, 0.9))
    p.poly([(X(40), Y(-446)), (X(0), Y(-420)), (X(6), Y(-400)), (X(46), Y(-432))], shade(shirt, 0.9))

    shoulder = {-1: (-74, -424), 1: (74, -424)}
    if pose == "ears":
        arms = {s: [shoulder[s], (s * 150, -500), (s * 92, hy + 12)] for s in (-1, 1)}
    elif pose == "raise":
        arms = {-1: [shoulder[-1], (-102, -334), (-104, -252)],
                1: [shoulder[1], (128, -560), (140, -700)]}
    else:
        arms = {s: [shoulder[s], (s * 102, -334), (s * 104, -252)] for s in (-1, 1)}

    def draw_arms():
        for s, (a, b, c) in arms.items():
            ln([a, b], shirt, 40)
            ln([b, c], skin, 30)
            if pose == "raise" and s == 1:
                rr(c[0] - 18, c[1] - 40, c[0] + 18, c[1] + 18, 16, skin)
            else:
                e(c[0], c[1], 21, 22, skin)
            ln([a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)], shade(shirt, 0.94), 44)

    if pose != "ears":
        draw_arms()

    # head
    e(-90, hy + 10, 17, 22, sk_d)
    e(90, hy + 10, 17, 22, sk_d)
    e(0, hy, 92, 98, skin)
    p.pie(X(-99), Y(hy - 106), X(99), Y(hy + 66), 180, 360, hair)
    for x, y, rx, ry in ((-52, -46, 42, 26), (-6, -56, 46, 26), (44, -48, 42, 26)):
        e(x, hy + y + (8 if down_face else 0), rx, ry, hair)
    e(-86, hy - 18, 16, 34, hair)
    e(86, hy - 18, 16, 34, hair)

    # face
    eyes = {}
    for s in (-1, 1):
        ex = s * 34
        eyes[s] = (X(ex), Y(ey))
        if mood == "down":
            arc(ex - 15, ey - 10, ex + 15, ey + 8, 15, 165, INK, 5)
        elif mood == "smile":
            arc(ex - 15, ey - 6, ex + 15, ey + 14, 195, 345, INK, 6)
        else:
            iy = 6 if mood == "teary" else 2
            e(ex, ey, 17, 19, (255, 255, 255))
            e(ex + look, ey + iy, 12, 13, (66, 42, 30))
            e(ex + look, ey + iy, 6, 7, (14, 10, 10))
            e(ex + look - 4, ey + iy - 5, 4, 4, (255, 255, 255))
            if mood == "teary":
                e(ex + look + 4, ey + iy + 5, 2.5, 2.5, (255, 255, 255))
                arc(ex - 17, ey - 4, ex + 17, ey + 22, 20, 160, (180, 215, 240), 4)
            if mood == "scared":
                e(ex, ey - 17, 18, 5, skin)
        # brows
        if mood in ("down", "teary", "scared"):
            ln([(s * 18, ey - 30), (s * 52, ey - 22)], hair, 6)
        else:
            ln([(s * 18, ey - 30), (s * 50, ey - 32)], hair, 6)
    e(0, ey + 24, 6, 4, sk_d)
    my = ey + 50
    if mood in ("down", "teary"):
        arc(-18, my - 4, 18, my + 18, 200, 340, INK, 5)
    elif mood == "scared":
        rr(-14, my - 2, 14, my + 3, 2, INK)
    elif mood == "smile":
        p.pie(X(-26), Y(my - 22), X(26), Y(my + 22), 0, 180, (150, 50, 50))
        rr(-20, my - 1, 20, my + 6, 3, (255, 255, 255))
        e(-58, ey + 32, 14, 8, (226, 140, 124))
        e(58, ey + 32, 14, 8, (226, 140, 124))
    elif mood == "understand":
        arc(-20, my - 16, 20, my + 8, 25, 155, INK, 5)
        e(-58, ey + 30, 12, 7, (222, 146, 128))
        e(58, ey + 30, 12, 7, (222, 146, 128))
    else:
        arc(-14, my - 8, 14, my + 6, 30, 150, INK, 5)

    if pose == "ears":
        draw_arms()
    return {"eyes": eyes, "head": (X(0), Y(hy)), "shoulderL": (X(-74), Y(-424)), "hand": (X(140), Y(-700))}


def teacher(p, cx, gy, sc=1.0, hand_to=None, talk=False, look=10,
            kurta=(122, 58, 74), dupatta=(236, 184, 92), skin=(196, 140, 104)):
    """A kneeling teacher (knee on the floor at gy)."""

    def X(x):
        return cx + x * sc

    def Y(y):
        return gy + y * sc

    def e(x, y, rx, ry, fill):
        p.e(X(x), Y(y), rx * sc, ry * sc, fill)

    def rr(x0, y0, x1, y1, r, fill):
        p.rr(X(x0), Y(y0), X(x1), Y(y1), r * sc, fill)

    def ln(pts, fill, w):
        p.ln([(X(x), Y(y)) for x, y in pts], fill, w * sc)

    pants = (60, 52, 70)
    sk_d = shade(skin, 0.86)
    # kneeling legs
    rr(-150, -130, 120, 0, 50, pants)
    rr(20, -250, 150, -10, 55, shade(pants, 1.1))
    e(-140, -14, 50, 18, (40, 34, 40))
    e(110, -12, 52, 18, (40, 34, 40))
    # torso (kurta)
    p.poly([(X(-112), Y(-500)), (X(112), Y(-500)), (X(150), Y(-120)), (X(-150), Y(-120))], kurta)
    e(-108, -480, 34, 34, kurta)
    e(108, -480, 34, 34, kurta)
    rr(-150, -150, 150, -100, 30, kurta)
    p.poly([(X(-112), Y(-505)), (X(-60), Y(-512)), (X(120), Y(-170)), (X(70), Y(-150))], dupatta)
    rr(-22, -540, 22, -495, 8, sk_d)
    p.poly([(X(-30), Y(-505)), (X(0), Y(-470)), (X(30), Y(-505))], shade(skin, 0.95))
    # left arm resting on knee
    ln([(-110, -470), (-160, -330), (-80, -240)], kurta, 46)
    e(-70, -238, 24, 22, skin)
    # head
    hy = -615
    e(-70, hy - 95, 46, 40, HAIR)  # bun
    e(-92, hy + 8, 16, 22, sk_d)
    e(92, hy + 8, 16, 22, sk_d)
    e(0, hy, 90, 98, skin)
    p.pie(X(-96), Y(hy - 104), X(96), Y(hy + 50), 180, 360, HAIR)
    e(-30, hy - 52, 70, 28, HAIR)
    e(4, hy - 50, 58, 24, HAIR)
    e(-84, hy - 22, 16, 40, HAIR)
    e(84, hy - 22, 16, 40, HAIR)
    ey = hy + 16
    for s in (-1, 1):
        ex = s * 34
        e(ex, ey, 15, 16, (255, 255, 255))
        e(ex + look * 0.6, ey + 2, 10, 11, (60, 38, 28))
        e(ex + look * 0.6 - 3, ey - 2, 3, 3, (255, 255, 255))
        p.e(X(ex), Y(ey), 25 * sc, 23 * sc, None, (52, 42, 40), 4 * sc)
        ln([(s * 16, ey - 34), (s * 50, ey - 37)], HAIR, 6)
    ln([(-9, ey - 2), (9, ey - 2)], (52, 42, 40), 4)
    e(0, ey + 26, 6, 4, sk_d)
    e(0, ey + 6, 3, 3, (180, 40, 50))  # bindi
    my = ey + 52
    if talk:
        e(0, my, 15, 11, (130, 46, 46))
    else:
        p.arc(X(-22), Y(my - 18), X(22), Y(my + 8), 25, 155, INK, 5 * sc)
    e(-55, ey + 34, 13, 7, (214, 128, 112))
    e(55, ey + 34, 13, 7, (214, 128, 112))
    # right arm reaching out
    sh = (X(110), Y(-470))
    tgt = hand_to or (X(260), Y(-300))
    el = ((sh[0] + tgt[0]) / 2 + 10 * sc, max(sh[1], tgt[1]) + 70 * sc)
    p.ln([sh, el], kurta, 46 * sc)
    p.ln([el, tgt], skin, 32 * sc)
    p.e(tgt[0], tgt[1], 26 * sc, 22 * sc, skin)


def classmate(p, cx, cy, sc, shirt, look=0, mood="stare", hair=HAIR, skin=SKIN, back=False):
    """Seated classmate: head centred at (cx, cy)."""
    p.rr(cx - 110 * sc, cy + 70 * sc, cx + 110 * sc, cy + 330 * sc, 60 * sc, shirt)
    p.rr(cx - 16 * sc, cy + 50 * sc, cx + 16 * sc, cy + 90 * sc, 6 * sc, shade(skin, 0.86))
    p.e(cx - 84 * sc, cy + 8 * sc, 16 * sc, 20 * sc, shade(skin, 0.86))
    p.e(cx + 84 * sc, cy + 8 * sc, 16 * sc, 20 * sc, shade(skin, 0.86))
    if back:
        p.e(cx, cy, 86 * sc, 92 * sc, hair)
        p.e(cx, cy + 66 * sc, 40 * sc, 22 * sc, shade(skin, 0.9))
        return
    p.e(cx, cy, 84 * sc, 90 * sc, skin)
    p.pie(cx - 90 * sc, cy - 98 * sc, cx + 90 * sc, cy + 50 * sc, 180, 360, hair)
    for s in (-1, 1):
        ex, ey = cx + s * 32 * sc, cy + 14 * sc
        if mood == "smile":
            p.arc(ex - 13 * sc, ey - 6 * sc, ex + 13 * sc, ey + 12 * sc, 195, 345, INK, 5 * sc)
        else:
            p.e(ex, ey, 15 * sc, 17 * sc, (255, 255, 255))
            p.e(ex + look * sc, ey + 1 * sc, 10 * sc, 11 * sc, (40, 28, 22))
            p.e(ex + (look - 3) * sc, ey - 3 * sc, 3 * sc, 3 * sc, (255, 255, 255))
    my = cy + 52 * sc
    if mood == "smile":
        p.arc(cx - 20 * sc, my - 18 * sc, cx + 20 * sc, my + 8 * sc, 25, 155, INK, 5 * sc)
    else:
        p.e(cx, my, 9 * sc, 6 * sc, INK)


def desk(p, x0, y0, x1, y1):
    p.rr(x0, y0, x1, y1, 14, (150, 102, 62))
    p.rr(x0 - 10, y0 - 6, x1 + 10, y0 + 22, 10, (186, 132, 84))


# ---------------------------------------------------------------- backgrounds
def classroom(board_text=True):
    img = vgrad(W * K, H * K, (238, 228, 206), (224, 210, 184))
    p = Pen(img)
    floor = 1330
    p.rr(-10, floor, W + 10, H + 10, 0, (176, 128, 86))
    for i in range(9):
        y = floor + 30 + i * i * 9 + i * 20
        p.rr(-10, y, W + 10, y + 3, 0, (156, 110, 72))
    p.rr(-10, floor - 18, W + 10, floor, 0, (140, 96, 60))
    # board
    p.rr(110, 280, 970, 800, 18, (130, 86, 48))
    p.rr(132, 302, 948, 778, 10, (44, 76, 62))
    if board_text:
        chalk = (232, 236, 228)
        p.text((540, 430), "ক  খ  গ  ঘ", font("hind-siliguri-600", 68 * K), chalk)
        p.text((540, 560), "২ + ৩ = ৫", font("hind-siliguri-600", 64 * K), chalk)
        p.rr(380, 650, 700, 656, 3, (200, 206, 196))
    p.rr(140, 790, 320, 806, 4, (210, 210, 200))
    # clock + window
    p.e(930, 170, 58, 58, (250, 248, 240))
    p.e(930, 170, 58, 58, None, (120, 90, 60), 8)
    p.ln([(930, 170), (930, 132)], INK, 6)
    p.ln([(930, 170), (958, 182)], INK, 6)
    p.rr(40, 90, 230, 230, 8, (190, 160, 120))
    p.rr(52, 102, 218, 218, 4, (190, 222, 236))
    p.rr(132, 102, 138, 218, 0, (190, 160, 120))
    return img


@lru_cache(None)
def scene1_base():
    img = classroom()
    p = Pen(img)
    child(p, 540, 1290, sc=1.05, pose="ears", mood="down")
    shirts = [(220, 226, 238), (232, 222, 206), (214, 230, 222), (236, 226, 232)]
    hairs = [HAIR, (60, 40, 30), (30, 24, 24), (50, 34, 28)]
    for i, x in enumerate((130, 400, 680, 950)):
        classmate(p, x, 1520, 1.15, shirts[i], hair=hairs[i], back=True)
    desk(p, -40, 1660, 1120, 1960)
    for i, x in enumerate((240, 840)):
        classmate(p, x, 1780, 1.7, shirts[i + 1], hair=hairs[i + 2], back=True)
    return down(img).convert("RGB")


@lru_cache(None)
def scene2_base():
    bg = vgrad(W * K, H * K, (226, 214, 192), (206, 190, 166))
    p = Pen(bg)
    p.rr(-40, 120, 520, 620, 10, (44, 76, 62))
    looks = {(150, 520): 12, (940, 470): -12, (130, 1480): 12, (960, 1540): -12, (560, 260): 0}
    for i, ((x, y), lk) in enumerate(looks.items()):
        classmate(p, x, y, 1.25, [(220, 226, 238), (214, 230, 222), (236, 226, 232)][i % 3], look=lk)
    bg = bg.filter(ImageFilter.GaussianBlur(14 * K))
    fg = canvas()
    anchors = child(Pen(fg), 540, 2230, sc=2.4, pose="ears", mood="teary")
    bg.alpha_composite(fg)
    return down(bg).convert("RGB"), anchors["eyes"]


@lru_cache(None)
def fear_half():
    img = vgrad(W * K, 960 * K, (70, 70, 76), (34, 34, 38))
    img.alpha_composite(down(radial(W, 960, 540, 820, 420, (230, 230, 230), 0.35), W * K, 960 * K))
    p = Pen(img)
    p.e(540, 905, 230, 34, (24, 24, 26))
    child(p, 540, 900, sc=0.82, pose="down", mood="scared")
    return down(img, W, 960).convert("RGB")


@lru_cache(None)
def talk_half(understood):
    img = vgrad(W * K, 960 * K, (250, 230, 200), (236, 204, 160))
    img.alpha_composite(down(radial(W, 960, 560, 420, 600, (255, 236, 190), 0.6), W * K, 960 * K))
    p = Pen(img)
    p.rr(-10, 840, W + 10, 970, 0, (190, 140, 96))
    anchors = child(Pen(canvas()), 700, 900, sc=0.8, mood="listen")
    teacher(p, 380, 900, sc=0.8, hand_to=anchors["shoulderL"], talk=not understood)
    a = child(p, 700, 900, sc=0.8, mood="understand" if understood else "listen", look=-8)
    if understood:
        hx, hy = a["head"]
        bx, by = hx + 120, hy - 150
        p.e(bx, by, 64, 64, (255, 230, 120))
        p.e(bx, by, 40, 40, (255, 210, 70))
        p.rr(bx - 20, by + 38, bx + 20, by + 70, 6, (150, 150, 150))
        for ang in range(0, 360, 45):
            r0, r1 = 84, 116
            c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            p.ln([(bx + r0 * c, by + r0 * s), (bx + r1 * c, by + r1 * s)], (255, 200, 60), 8)
    else:
        bx, by = 330, 140
        p.rr(bx - 110, by - 70, bx + 110, by + 70, 50, (255, 255, 255))
        p.poly([(bx + 10, by + 60), (bx + 60, by + 60), (bx + 50, by + 120)], (255, 255, 255))
        for i in range(3):
            p.e(bx - 50 + i * 50, by, 13, 13, (120, 70, 70))
    return down(img, W, 960).convert("RGB")


@lru_cache(None)
def scene5_frame(nod, talk):
    img = classroom(board_text=True)
    p = Pen(img)
    for x, sh in ((150, (220, 226, 238)), (930, (214, 230, 222))):
        classmate(p, x, 1080, 0.9, sh, mood="smile")
        desk(p, x - 150, 1220, x + 150, 1360)
    gy = 1500
    anchors = child(Pen(canvas()), 740, gy, sc=1.1, head_dy=nod, mood="understand")
    teacher(p, 360, gy, sc=1.1, hand_to=anchors["shoulderL"], talk=talk)
    child(p, 740, gy, sc=1.1, head_dy=nod, mood="understand" if nod or not talk else "listen", look=-8)
    return down(img).convert("RGB")


@lru_cache(None)
def scene6_base():
    img = classroom()
    p = Pen(img)
    for x, sh, up in ((170, (232, 222, 206), False), (910, (214, 230, 222), True)):
        a = child(p, x, 1500, sc=0.78, pose="raise" if up else "down", mood="smile", shirt=sh)
        desk(p, x - 170, 1260, x + 170, 1420)
    a = child(p, 540, 1700, sc=1.15, pose="raise", mood="smile")
    desk(p, 260, 1380, 820, 1700)
    p.rr(300, 1430, 520, 1460, 6, (240, 240, 230))
    return down(img).convert("RGB"), a["hand"]


def cover(img, w, h):
    sc = max(w / img.width, h / img.height)
    im = img.resize((math.ceil(img.width * sc), math.ceil(img.height * sc)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))


def card(img, radius, shadow=True):
    """Rounded-corner RGBA card with a soft drop shadow (returned with padding)."""
    pad = 60
    out = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad))
    if shadow:
        sh = Image.new("L", out.size)
        ImageDraw.Draw(sh).rounded_rectangle([pad, pad + 16, pad + img.width, pad + img.height + 16], radius, fill=150)
        out.putalpha(sh.filter(ImageFilter.GaussianBlur(24)))
    mask = Image.new("L", (img.width * K, img.height * K))
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width * K, img.height * K], radius * K, fill=255)
    out.paste(img.convert("RGB"), (pad, pad), mask.resize(img.size, Image.LANCZOS))
    return out


@lru_cache(None)
def founder_base():
    photo = asset("founder.jpg", "founder.jpeg", "founder.png")
    if photo:
        ph = Image.open(photo).convert("RGB")
        bg = cover(ph, W, H).filter(ImageFilter.GaussianBlur(36)).convert("RGBA")
        bg.alpha_composite(Image.new("RGBA", (W, H), (8, 26, 30, 175)))
        w = 980 if ph.width > ph.height else 760
        ph = ph.resize((w, round(ph.height * w / ph.width)), Image.LANCZOS)
        c = card(ph, 36)
        top = 700 - c.height // 2 if ph.width > ph.height else 140
        bg.alpha_composite(c, ((W - c.width) // 2, top))
        ny = top + c.height - 60 + 90
        d = ImageDraw.Draw(bg)
        d.text((540, ny), "নাসিম ইকবাল", font=font("noto-serif-bengali-700", 88), fill=(255, 255, 255),
               anchor="mm")
        d.rounded_rectangle([440, ny + 66, 640, ny + 72], 3, fill=(236, 196, 90))
        d.text((540, ny + 130), "প্রতিষ্ঠাতা, জ্ঞানবৃত্ত", font=font("hind-siliguri-600", 48),
               fill=(236, 196, 90), anchor="mm")
        return bg.convert("RGB")
    # placeholder when no photo is supplied
    bg = vgrad(W, H, (24, 34, 58), (58, 40, 64))
    cx, cy, r = 540, 820, 340
    sq = Image.new("RGB", (2 * r, 2 * r), (70, 80, 106))
    d = ImageDraw.Draw(sq)
    d.ellipse([r - 120, r - 190, r + 120, r + 70], fill=(150, 160, 184))
    d.ellipse([r - 240, r + 110, r + 240, r + 560], fill=(150, 160, 184))
    mask = Image.new("L", (2 * r, 2 * r))
    ImageDraw.Draw(mask).ellipse([0, 0, 2 * r, 2 * r], fill=255)
    bg.paste(sq, (cx - r, cy - r), mask)
    d = ImageDraw.Draw(bg)
    d.text((540, 1290), "নাসিম ইকবাল", font=font("noto-serif-bengali-700", 84), fill=(255, 255, 255), anchor="mm")
    d.text((540, 1385), "প্রতিষ্ঠাতা, জ্ঞানবৃত্ত", font=font("hind-siliguri-400", 46), fill=(236, 196, 120),
           anchor="mm")
    return bg.convert("RGB")


# ---------------------------------------------------------------- grading
def grade(img, sat=1.0, bright=1.0, tint=(1, 1, 1)):
    a = np.asarray(img).astype(np.float32)
    g = (a * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    a = (g + sat * (a - g)) * bright * np.array(tint, np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def zoom(img, z, fx=0.5, fy=0.5):
    if abs(z - 1) < 1e-4:
        return img
    w, h = W / z, H / z
    x0 = min(max(fx * W - w / 2, 0), W - w)
    y0 = min(max(fy * H - h / 2, 0), H - h)
    return img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))


def fade_text(img, lines, f, alpha):
    """Draw [(xy, text, rgb), ...] centred, at the given opacity (ImageDraw ignores text alpha here)."""
    if alpha <= 0:
        return img
    layer = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(layer)
    for xy, text, rgb in lines:
        d.text(xy, text, font=f, fill=rgb + (255,), anchor="mm")
    layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    out = img.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def fade_black(img, a):
    return Image.blend(Image.new("RGB", (W, H)), img, max(0.0, min(1.0, a)))


GRAY = dict(sat=0.18, bright=0.86, tint=(0.96, 0.99, 1.05))


# ---------------------------------------------------------------- scenes
def s1(t):
    img = zoom(scene1_base(), 1.0 + 0.10 * ease(t / 6), 0.5, 0.42)
    return fade_black(grade(img, **GRAY), t / 0.8)


def s2(t):
    base, eyes = scene2_base()
    img = base.copy()
    layer = canvas()
    p = Pen(layer)
    for side, delay in ((-1, 0.0), (1, 1.1)):
        ex, ey = eyes[side]
        prog = ramp(t, 1.6 + delay, 5.2 + delay)
        if t > 1.4 + delay:
            x = ex + side * -12
            y0 = ey + 40
            y = y0 + 260 * prog
            p.ln([(x, y0), (x + side * -4, y)], (200, 225, 245, 110), 8)
            p.e(x + side * -4, y, 11, 15, (210, 232, 250, 230))
            p.e(x + side * -4 - 3, y - 5, 4, 5, (255, 255, 255, 255))
    img = Image.alpha_composite(img.convert("RGBA"), down(layer)).convert("RGB")
    img = zoom(img, 1.0 + 0.14 * ease(t / 7), 0.5, 0.5)
    return fade_black(grade(img, **GRAY), 1 - ramp(t, 5.9, 7.0))


def s3(t):
    img = radial(W, H, 540, 900, 900, (46, 46, 54), 1.0)
    bg = Image.new("RGB", (W, H), (6, 6, 8))
    bg.paste(img, (0, 0), img)
    layer = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(layer)
    f = font("hind-siliguri-700", 98)
    a1, a2 = ramp(t, 0.4, 1.4), ramp(t, 1.3, 2.3)
    d.text((540, 800), "শৃঙ্খলা শেখাচ্ছি,", font=f, fill=(255, 255, 255, int(255 * a1)), anchor="mm")
    parts = [("নাকি ", (255, 255, 255)), ("অপমান", (232, 96, 84)), (" করছি?", (255, 255, 255))]
    widths = [d.textlength(s, font=f) for s, _ in parts]
    x = 540 - sum(widths) / 2
    for (s, c), w in zip(parts, widths):
        d.text((x, 940), s, font=f, fill=c + (int(255 * a2),), anchor="lm")
        x += w
    d.rounded_rectangle([440, 1050, 640, 1056], 3, fill=(232, 96, 84, int(200 * a2)))
    sc = 1 + 0.04 * ease(t / 8)
    layer = layer.resize((int(W * sc), int(H * sc)), Image.BICUBIC).crop(
        (int((W * sc - W) / 2), int((H * sc - H) / 2), int((W * sc - W) / 2) + W, int((H * sc - H) / 2) + H))
    bg.paste(layer, (0, 0), layer)
    return fade_black(bg, 1 - ramp(t, 7.4, 8.0))


def label(d, xy, text, bg, fg):
    f = font("hind-siliguri-600", 46)
    w = d.textlength(text, font=f)
    x, y = xy
    d.rounded_rectangle([x, y, x + w + 56, y + 76], 38, fill=bg)
    d.text((x + 28, y + 38), text, font=f, fill=fg, anchor="lm")


def s4(t):
    frame = Image.new("RGB", (W, H), (10, 10, 12))
    top = grade(fear_half(), sat=0.08, bright=0.82)
    bot = grade(talk_half(t > 4.2), sat=1.05, bright=1.02, tint=(1.04, 1.0, 0.94))
    ox_top = int(-W * (1 - ease(t / 0.6)))
    ox_bot = int(W * (1 - ease((t - 0.35) / 0.6)))
    frame.paste(top, (ox_top, 0))
    frame.paste(bot, (ox_bot, 960))
    d = ImageDraw.Draw(frame)
    if t > 0.7:
        label(d, (40 + ox_top, 40), "ভয়ে চুপ", (20, 20, 22), (230, 230, 230))
        label(d, (476 + ox_bot, 1030), "ভুল বুঝে শুধরে নেওয়া", (255, 255, 255), (150, 70, 40))
    d.rectangle([0, 956, W, 964], fill=(255, 255, 255))
    return frame


def s5(t):
    nod = 0
    if 2.2 < t < 6.5:
        nod = int(round(14 * max(0.0, math.sin(2 * math.pi * 1.1 * (t - 2.2)))))
    talk = (t < 2.2 or 6.5 < t < 9.5) and int(t * 5) % 2 == 0
    img = zoom(scene5_frame(nod, talk), 1.0 + 0.06 * ease(t / 10), 0.5, 0.55)
    k = ramp(t, 0, 6)
    img = grade(img, sat=0.3 + 0.75 * k, bright=0.88 + 0.14 * k, tint=(1 + 0.05 * k, 1.0, 1 - 0.05 * k))
    glow = radial(W, H, 120, 300, 1200, (255, 214, 150), 0.35 * k)
    img = img.convert("RGBA")
    img.alpha_composite(glow)
    return img.convert("RGB")


def s6(t):
    base, hand = scene6_base()
    img = zoom(base, 1.06 - 0.06 * ease(t / 7), 0.5, 0.6)
    img = grade(img, sat=1.15, bright=1.06, tint=(1.03, 1.0, 0.97)).convert("RGBA")
    layer = canvas()
    p = Pen(layer)
    z = 1.06 - 0.06 * ease(t / 7)
    hx = (hand[0] - 540) * z + 540
    hy = (hand[1] - 0.6 * H) * z + 0.6 * H
    for i, (dx, dy, s) in enumerate(((-80, -40, 26), (70, -90, 20), (90, 20, 16), (-40, -130, 14))):
        a = 0.5 + 0.5 * math.sin(t * 5 + i * 1.7)
        r = s * (0.6 + 0.6 * a)
        x, y = hx + dx, hy + dy
        p.poly([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r),
                (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)],
               (255, 214, 90, int(255 * a)))
    img.alpha_composite(down(layer))
    a = ramp(t, 0.4, 1.0)
    pop = 0.85 + 0.15 * ease((t - 0.4) / 0.5)
    ribbon = Image.new("RGBA", (W, 300))
    d = ImageDraw.Draw(ribbon)
    d.rounded_rectangle([60, 70, 1020, 240], 85, fill=(196, 74, 56, 235))
    d.text((540, 152), "শৃঙ্খলা থাকবে, অপমান নয়।", font=font("hind-siliguri-700", 72), fill="white", anchor="mm")
    ribbon = ribbon.resize((int(W * pop), int(300 * pop)), Image.BICUBIC)
    ribbon.putalpha(ribbon.getchannel("A").point(lambda v: int(v * a)))
    img.alpha_composite(ribbon, ((W - ribbon.width) // 2, 60 + (300 - ribbon.height) // 2))
    return img.convert("RGB")


def s7(t):
    img = zoom(founder_base(), 1.0 + 0.08 * ease(t / 6), 0.5, 0.45)
    return img


LOGO_CIRCLES = [("জ্ঞান", (236, 184, 72)), ("নৈতিকতা", (64, 182, 168)),
                ("দক্ষতা", (232, 110, 90)), ("আত্মনির্ভরতা", (132, 108, 220))]


# circle centres / radii inside logo_cycle.png (2238 x 2238, transparent), in the order they light up:
# জ্ঞান, নৈতিকতা, দক্ষতা, আত্মনির্ভরতা, then the centre monogram
CYCLE_SPOTS = [(1114, 475, 237), (1726, 1060, 237), (1114, 1691, 237), (492, 1060, 237), (1114, 1083, 353)]
CYCLE_TIMES = [0.6, 1.9, 3.2, 4.5, 5.8]
CYCLE_SIZE = 980


@lru_cache(None)
def s8_assets():
    src = Image.open(asset("logo_cycle.png")).convert("RGBA")
    box = src.getchannel("A").getbbox()
    cyc = src.crop(box)
    sc = CYCLE_SIZE / cyc.width
    cyc = cyc.resize((CYCLE_SIZE, round(cyc.height * sc)), Image.LANCZOS)
    spots = [((x - box[0]) * sc, (y - box[1]) * sc, r * sc) for x, y, r in CYCLE_SPOTS]
    dim = grade(cyc.convert("RGB"), sat=0.1, bright=0.45).convert("RGBA")
    dim.putalpha(cyc.getchannel("A"))
    bg = vgrad(W, H, (8, 32, 38), (10, 16, 28))
    bg.alpha_composite(radial(W, H, 540, 1050, 900, (30, 110, 110), 0.45))
    logo = asset("logo.png")
    lg = None
    if logo:
        lg = Image.open(logo).convert("RGB")
        lg = card(lg.resize((820, round(lg.height * 820 / lg.width)), Image.LANCZOS), 30)
    return bg.convert("RGB"), cyc, dim, spots, lg


def s8(t):
    if not asset("logo_cycle.png"):
        return s8_drawn(t)
    bg, cyc, dim, spots, lg = s8_assets()
    mask = Image.new("L", cyc.size)
    md = ImageDraw.Draw(mask)
    glow = Image.new("RGBA", cyc.size)
    gd = ImageDraw.Draw(glow)
    for (x, y, r), t0 in zip(spots, CYCLE_TIMES):
        on = ramp(t, t0, t0 + 0.6)
        if on <= 0:
            continue
        rr_ = (r + 6) * (0.6 + 0.4 * on)
        md.ellipse([x - rr_, y - rr_, x + rr_, y + rr_], fill=int(255 * on))
        pulse = math.exp(-max(0.0, t - t0) * 2.0)
        g = r + 40
        gd.ellipse([x - g, y - g, x + g, y + g], fill=(255, 236, 170, int(230 * pulse * on)))
    full = ramp(t, 6.4, 7.0)  # finally light up the ring itself
    if full > 0:
        mask = Image.blend(mask, Image.new("L", cyc.size, 255), full)
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    art = Image.composite(cyc, dim, mask)
    a = ramp(t, 0.0, 0.6)
    art.putalpha(art.getchannel("A").point(lambda v: int(v * a)))
    pop = 0.96 + 0.06 * ease(t / 8)
    size = (round(art.width * pop), round(art.height * pop))
    art = art.resize(size, Image.BICUBIC)
    glow = glow.filter(ImageFilter.GaussianBlur(28)).resize(size)
    frame = bg.convert("RGBA")
    pos = ((W - size[0]) // 2, 1060 - size[1] // 2)
    frame.alpha_composite(glow, pos)
    frame.alpha_composite(art, pos)
    if lg is not None:
        la = ramp(t, 0.2, 0.9)
        l2 = lg.copy()
        l2.putalpha(l2.getchannel("A").point(lambda v: int(v * la)))
        frame.alpha_composite(l2, ((W - l2.width) // 2, 300 - l2.height // 2 - int(30 * (1 - la))))
    frame = fade_text(frame, [((540, 1650), "জ্ঞান, নৈতিকতা, দক্ষতা ও", (255, 255, 255)),
                              ((540, 1730), "আত্মনির্ভরতার পথে", (236, 196, 90))],
                      font("hind-siliguri-600", 52), ramp(t, 6.2, 7.0))
    return fade_black(frame.convert("RGB"), 1 - ramp(t, 7.5, 8.0))


def s8_drawn(t):
    img = vgrad(W, H, (12, 22, 40), (22, 18, 40))
    cx, cy, R, r = 540, 960, 290, 132
    logo = asset("logo.png")
    layer = canvas()
    p = Pen(layer)
    starts = [0.6, 2.0, 3.3, 4.6]
    pos = [(cx, cy - R), (cx + R, cy), (cx, cy + R), (cx - R, cy)]
    p.e(cx, cy, R, R, None, (60, 70, 100), 6)
    for i in range(4):
        prog = ramp(t, starts[i] + 0.3, starts[i] + 1.3) if i < 3 else ramp(t, 5.8, 6.6)
        if prog > 0:
            a0 = -90 + 90 * i + 28
            p.arc(cx - R, cy - R, cx + R, cy + R, a0, a0 + (90 - 56) * prog, (236, 220, 180), 8)
    glow = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(glow)
    for i, ((name, col), (x, y)) in enumerate(zip(LOGO_CIRCLES, pos)):
        on = ramp(t, starts[i], starts[i] + 0.6)
        base = (34, 42, 66)
        fill = tuple(int(b + (c - b) * on) for b, c in zip(base, col))
        if on > 0:
            gd.ellipse([x - r - 40, y - r - 40, x + r + 40, y + r + 40], fill=col + (int(150 * on),))
        p.e(x, y, r, r, fill)
        p.e(x, y, r, r, None, tuple(min(255, v + 40) for v in fill), 5)
        size = 50
        f = font("hind-siliguri-700", size * K)
        while p.d.textlength(name, font=f) > (2 * r - 34) * K:
            size -= 2
            f = font("hind-siliguri-700", size * K)
        p.text((x, y + 4), name, f, (255, 255, 255, int(110 + 145 * on)))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
    img.alpha_composite(down(layer))
    img = img.convert("RGB")
    a = ramp(t, 0.0, 0.8)
    if logo:
        lg = Image.open(logo).convert("RGBA")
        lg.thumbnail((620, 300))
        lg.putalpha(lg.getchannel("A").point(lambda v: int(v * a)))
        img.paste(lg, ((W - lg.width) // 2, 400 - lg.height // 2), lg)
    else:
        img = fade_text(img, [((540, 400), "জ্ঞানবৃত্ত", (255, 255, 255))], font("noto-serif-bengali-700", 130), a)
        img = fade_text(img, [((540, 505), "GYANBRITTO", (236, 196, 120))], font("hind-siliguri-600", 40), a)
    img = fade_text(img, [((540, 1420), "জ্ঞান, নৈতিকতা, দক্ষতা ও", (255, 255, 255)),
                          ((540, 1495), "আত্মনির্ভরতার পথে", (255, 255, 255))],
                    font("hind-siliguri-600", 50), ramp(t, 5.6, 6.4))
    return fade_black(img.convert("RGB"), 1 - ramp(t, 7.5, 8.0))


SCENES = [(0, 6, s1), (6, 13, s2), (13, 21, s3), (21, 29, s4), (29, 39, s5), (39, 46, s6), (46, 52, s7),
          (52, 60, s8)]
XFADE = {4: 0.6, 5: 0.6, 6: 0.6, 7: 0.6}  # crossfade into scene index (others cut via black)

CAPTIONS = [
    (0.6, 5.6, "একটি ছোট্ট শিশু… একটি ছোট্ট ভুল…"),
    (6.4, 9.7, "শাস্তি হিসেবে তাকে কান ধরে দাঁড় করিয়ে রাখা হলো।"),
    (9.7, 12.8, "পুরো ক্লাসের চোখ তখন তার দিকে।"),
    (15.0, 18.0, "কিন্তু আমরা কি কখনো ভেবেছি… সেই মুহূর্তে সে আসলে কী শিখল?"),
    (18.0, 20.8, "নিজের ভুল? নাকি… অপমান আর ভয়?"),
    (21.6, 24.6, "শাস্তির ভয়ে চুপ থাকা…"),
    (24.6, 26.9, "আর নিজের ভুল বুঝে নিজেকে শুধরে নেওয়া…"),
    (26.9, 28.9, "এই দুটো কখনোই এক নয়।"),
    (29.3, 32.4, "একজন শিক্ষকের কাজ শুধু নিয়ন্ত্রণ করা নয়।"),
    (32.4, 35.6, "তাঁর কাজ পথ দেখানো, দায়িত্ববোধ শেখানো,"),
    (35.6, 38.9, "আর আত্মমর্যাদাসম্পন্ন মানুষ হিসেবে গড়ে তোলা।"),
    (39.6, 42.6, "শৃঙ্খলা থাকবে, কিন্তু অপমান নয়।"),
    (42.6, 45.8, "শাসন থাকবে, কিন্তু মানবিকতার সঙ্গে।"),
    (46.4, 49.2, "কারণ আমরা শুধু ভালো শিক্ষার্থী নয়…"),
    (49.2, 51.9, "ভালো মানুষও গড়তে চাই।"),
]


def wrap(d, text, f, maxw):
    lines, cur = [], ""
    for word in text.split(" "):
        trial = (cur + " " + word).strip()
        if d.textlength(trial, font=f) <= maxw or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + [cur]


def draw_caption(img, t):
    for a, b, text in CAPTIONS:
        if a <= t < b:
            alpha = min(1.0, (t - a) / 0.25, (b - t) / 0.25)
            ov = Image.new("RGBA", (W, H))
            d = ImageDraw.Draw(ov)
            split = 21 <= t < 29
            f = font("hind-siliguri-600", 46 if split else 54)
            lines = wrap(d, text, f, 980 if split else 900)
            lh = 66 if split else 74
            cy = 960 if split else 1600
            top = cy - lh * len(lines) / 2
            wmax = max(d.textlength(s, font=f) for s in lines)
            d.rounded_rectangle([540 - wmax / 2 - 34, top - 18, 540 + wmax / 2 + 34, top + lh * len(lines) + 14],
                                26, fill=(0, 0, 0, int(150 * alpha)))
            for i, s in enumerate(lines):
                d.text((540, top + lh * i + lh / 2), s, font=f, fill=(255, 255, 255, int(255 * alpha)),
                       anchor="mm")
            base = img.convert("RGBA")
            base.alpha_composite(ov)
            return base.convert("RGB")
    return img


def frame_at(t, captions=True):
    for i, (a, b, fn) in enumerate(SCENES):
        if a <= t < b or i == len(SCENES) - 1:
            img = fn(t - a)
            xf = XFADE.get(i)
            if xf and t - a < xf:
                pa, _, pfn = SCENES[i - 1]
                img = Image.blend(pfn(t - pa), img, ease((t - a) / xf))
            break
    return draw_caption(img, t) if captions else img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--preview", type=float, nargs="*")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    if args.preview:
        for t in args.preview:
            frame_at(t, not args.no_captions).save(os.path.join(OUT, f"preview_{t:05.1f}.png"))
        return

    wav = os.path.join(OUT, "music.wav")
    music.write_wav(wav, music.build())
    audio = ["-i", wav]
    voice = asset("voice.wav", "voice.mp3", "voice.m4a")
    if voice:
        audio += ["-i", voice, "-filter_complex",
                  "[1:a]volume=0.45[m];[2:a]volume=1.0[v];[m][v]amix=inputs=2:duration=first:normalize=0[a]",
                  "-map", "0:v", "-map", "[a]"]
    name = "reel_no_captions.mp4" if args.no_captions else "reel.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", *audio, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
           os.path.join(OUT, name)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DUR * FPS)
    for n in range(total):
        proc.stdin.write(frame_at(n / FPS, not args.no_captions).tobytes())
        if n % 150 == 0:
            print(f"{n}/{total}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("wrote", os.path.join(OUT, name))


if __name__ == "__main__":
    main()
