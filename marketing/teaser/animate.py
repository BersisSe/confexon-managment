"""Builds teaser.mp4: renders each element of story.html as a layer, then animates them."""
import math, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
W, H, FPS, BG = 1080, 1920, 30, (18, 17, 16, 255)
tmp = Path(tempfile.mkdtemp())

def layer(f, name, t=""):
    out = tmp / f"{f}-{name}-{t.replace(':', '')}.png"
    url = (HERE / "story.html").as_uri() + f"?f={f}&l={name}" + (f"&t={t}" if t else "")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    "--default-background-color=00000000", "--virtual-time-budget=8000",
                    f"--screenshot={out}", url], check=True, capture_output=True)
    full = Image.open(out).convert("RGBA")
    box = full.getbbox()
    return full.crop(box), box

def clamp(x): return max(0.0, min(1.0, x))
def ease_out(x): return 1 - (1 - clamp(x)) ** 3
def ease_in(x): return clamp(x) ** 3

def put(canvas, lay, alpha=1.0, dy=0.0, scale=1.0, width=1.0):
    img, (x0, y0, x1, y1) = lay
    if alpha <= 0 or width <= 0: return
    if width < 1: img = img.crop((0, 0, max(1, round(img.width * width)), img.height))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + dy
    if scale != 1: img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = x0 if width < 1 else round(cx - img.width / 2)
    if alpha < 1:
        img = img.copy()
        img.putalpha(img.getchannel("A").point(lambda a: int(a * alpha)))
    canvas.alpha_composite(img, (left, round(cy - img.height / 2)))

def rise(canvas, lay, t, start, dur=0.9, dist=60):
    p = ease_out((t - start) / dur)
    put(canvas, lay, alpha=p, dy=(1 - p) * dist)

clocks = [layer(1, "clock", f"00:0{n}") for n in (3, 2, 1, 0)]
rule, sub = layer(1, "rule"), layer(1, "sub")
quote, delegate = layer(2, "quote"), layer(2, "delegate")
head, logo, name, soon, url = (layer(3, n) for n in ("head", "logo", "name", "soon", "url"))

def scene1(c, t):
    i = int(clamp((t - 0.4) / 3) * 3 + 1e-6)          # 3, 2, 1, 0 one second apart
    since = t - (0.4 + i) if i else t
    pop = ease_out(since / 0.45)
    put(c, clocks[i], alpha=ease_out(t / 0.5) if i == 0 else 0.35 + 0.65 * pop,
        scale=1 + (0.12 if i == 3 else 0.06) * (1 - pop))
    put(c, rule, width=1 - clamp((t - 0.4) / 3))      # time bar drains
    rise(c, sub, t, 3.7)

def scene2(c, t):
    rise(c, quote, t, 0.1)
    rise(c, delegate, t, 0.9)

block, hammer = layer(3, "block"), layer(3, "hammer")
# pivot = end of the handle, in canvas pixels (derived from the block's position in the SVG)
PIVOT = (block[1][0] - 20 + 395, block[1][1] - 206 + 115)
HIT = 2.1  # seconds into scene 3

def swing(c, t):
    gone = ease_in((t - HIT - 0.3) / 0.35)      # gavel leaves, revealing the name
    alpha = ease_out((t - 0.9) / 0.35) * (1 - gone)
    if alpha <= 0: return
    if t < 1.65: angle = 32 * ease_out((t - 1.0) / 0.65)                      # lift
    elif t < HIT: angle = 32 * (1 - ease_in((t - 1.8) / (HIT - 1.8)))         # hold, then slam
    else: angle = 7 * math.sin(math.pi * clamp((t - HIT) / 0.25))             # bounce
    full = Image.new("RGBA", (W, H))
    full.alpha_composite(hammer[0], hammer[1][:2])
    full = full.rotate(-angle, resample=Image.BICUBIC, center=PIVOT)
    full.alpha_composite(block[0], block[1][:2])
    full.putalpha(full.getchannel("A").point(lambda a: int(a * alpha)))
    c.alpha_composite(full)

def impact(c, t):
    p = (t - HIT) / 0.5
    if not 0 <= p < 1: return
    x, y = block[1][0] + 80, block[1][1]
    d = ImageDraw.Draw(c)
    r = 100 + 90 * ease_out(p)
    for deg in (150, 180, 210, 330, 0, 30):
        a = math.radians(deg)
        d.line([(x + math.cos(a) * r, y + math.sin(a) * r * 0.7),
                (x + math.cos(a) * (r + 50 * (1 - p)), y + math.sin(a) * (r + 50 * (1 - p)) * 0.7)],
               fill=(243, 239, 233, int(255 * (1 - p))), width=8)

def scene3(c, t):
    rise(c, head, t, 0.1, 1.0)
    swing(c, t)
    impact(c, t)
    p = ease_out((t - HIT - 0.55) / 0.9)
    put(c, logo, alpha=p, scale=1.25 - 0.25 * p)
    rise(c, name, t, HIT + 0.8)
    rise(c, soon, t, HIT + 1.4)
    rise(c, url, t, HIT + 1.9)
    q = (t - HIT) / 0.35
    if 0 <= q < 1:  # screen shake
        shaken = Image.new("RGBA", (W, H), BG)
        shaken.paste(c, (0, round(18 * (1 - q) * math.cos(q * 22))))
        c.paste(shaken)

ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                       "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "18",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(HERE / "teaser.mp4")],
                      stdin=subprocess.PIPE)
for scene, length, fades in ((scene1, 5.2, True), (scene2, 3.8, True), (scene3, 6.0, False)):
    for n in range(round(length * FPS)):
        t = n / FPS
        canvas = Image.new("RGBA", (W, H), BG)
        scene(canvas, t)
        if fades:  # ease-in fade to background before the next scene
            out = ease_in((t - (length - 0.6)) / 0.6)
            if out: canvas = Image.blend(canvas, Image.new("RGBA", (W, H), BG), out)
        ff.stdin.write(canvas.convert("RGB").tobytes())
ff.stdin.close()
assert ff.wait() == 0
