#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
马儿快跑 · 品牌素材生成脚本

用法：
    python build_assets.py

输入：
    source/logo.png    完整 logo 原图（透明底，建议 >= 1024x1024）

输出：
    png/               全部素材（固定文件名，上线后同名替换即可）

说明：
    - 所有素材都基于「完整 logo」（卡通马 + 手写字 + 黄色速度线），不裁切。
    - 完整 logo 的手写字是黑色，深色底不可直接用；深色场景统一用白色圆角卡片承载。
    - logo 自带黄色圆盘，不要再放黄底，否则圆盘会和底色融在一起。
"""

import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source', 'logo.png')
OUT = os.path.join(HERE, 'png')

# ---------- 品牌色 ----------
INK = (13, 14, 17, 255)        # 墨黑 #0D0E11
YELLOW = (245, 179, 1, 255)    # 品牌黄 #F5B301
WHITE = (255, 255, 255, 255)
CREAM = (255, 248, 230, 255)   # 暖白 #FFF8E6
GRAY = (138, 138, 144, 255)    # 次要灰 #8A8A90
SOFT = (200, 200, 206, 255)

F_DISPLAY = 'C:/Windows/Fonts/STXINGKA.TTF'   # 行楷，标语用
F_UI = 'C:/Windows/Fonts/msyh.ttc'            # 微软雅黑
F_UI_B = 'C:/Windows/Fonts/msyhbd.ttc'

SLOGAN_1 = '马儿跑得快'
SLOGAN_2 = '诚信赢天下'
SERVICES = '代买 · 代取送 · 代办 · 接送 · 代驾'
SLOGAN_FULL = '马儿跑得快，诚信赢天下'


def font(path, size):
    return ImageFont.truetype(path, size)


def fit_two(text1, text2, path, max_size, max_width, min_size=12):
    """两行标语用同一字号：取两行都能容纳的最大字号，避免一行大一行小。"""
    probe = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    size = max_size
    while size > min_size:
        f = font(path, size)
        if max(probe.textlength(text1, font=f), probe.textlength(text2, font=f)) <= max_width:
            return f, size
        size -= 2
    return font(path, min_size), min_size


def fit_font(text, path, max_size, max_width, min_size=12):
    """按可用宽度自动缩字号：行楷字宽不匀，必须实测，不能按字数估。"""
    probe = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    size = max_size
    while size > min_size:
        f = font(path, size)
        if probe.textlength(text, font=f) <= max_width:
            return f
        size -= 2
    return font(path, min_size)


def trim_logo(path):
    """去掉透明留白，保留完整 logo。"""
    im = Image.open(path).convert('RGBA')
    alpha = im.getchannel('A')
    box = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    if box:
        im = im.crop(box)
    return im


def fit(logo, box_w, box_h):
    w, h = logo.size
    s = min(box_w / w, box_h / h)
    return logo.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def white_card(logo, size, pad_ratio=0.07, radius_ratio=0.11, shadow=True):
    """白色圆角卡片 + 完整 logo，用于深色底。返回带透明外的 RGBA。"""
    card_pad = int(size * 0.02)
    card_size = size - card_pad * 2
    card = Image.new('RGBA', (card_size, card_size), (0, 0, 0, 0))
    face = Image.new('RGBA', (card_size, card_size), WHITE)
    face.putalpha(rounded_mask(card_size, int(card_size * radius_ratio)))
    card.alpha_composite(face)

    inner = int(card_size * (1 - pad_ratio * 2))
    lg = fit(logo, inner, inner)
    card.alpha_composite(lg, ((card_size - lg.width) // 2, (card_size - lg.height) // 2))

    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        d.rounded_rectangle(
            (card_pad, card_pad + int(size * 0.015), card_pad + card_size, card_pad + card_size + int(size * 0.015)),
            radius=int(card_size * radius_ratio), fill=(0, 0, 0, 90))
        from PIL import ImageFilter
        sh = sh.filter(ImageFilter.GaussianBlur(int(size * 0.018)))
        out.alpha_composite(sh)
    out.alpha_composite(card, (card_pad, card_pad))
    return out


def build():
    os.makedirs(OUT, exist_ok=True)
    logo = trim_logo(SRC)
    print('source logo:', logo.size)

    # ---------- 1. 透明底完整 logo ----------
    pad = 16
    canvas = Image.new('RGBA', (logo.width + pad * 2, logo.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(logo, (pad, pad))
    canvas.save(os.path.join(OUT, 'logo-full.png'))

    # 水印版（合同、单据背景用）
    wm = logo.copy()
    alpha = wm.getchannel('A').point(lambda v: int(v * 0.14))
    wm.putalpha(alpha)
    wm.save(os.path.join(OUT, 'logo-watermark.png'))

    # ---------- 2. 单色底方图 ----------
    def square(bg, size, pad_ratio, out):
        c = Image.new('RGBA', (size, size), bg)
        inner = int(size * (1 - pad_ratio * 2))
        c.alpha_composite(fit(logo, inner, inner),
                          ((size - fit(logo, inner, inner).width) // 2,
                           (size - fit(logo, inner, inner).height) // 2))
        c.convert('RGB').save(out)

    square(WHITE, 1200, 0.06, os.path.join(OUT, 'logo-on-white-1200.png'))
    square(CREAM, 1200, 0.06, os.path.join(OUT, 'logo-on-cream-1200.png'))

    # 深色底安全版：白卡 + 完整 logo（透明外框，可直接叠到任意深色背景）
    card = white_card(logo, 1200, pad_ratio=0.075, radius_ratio=0.10)
    card.save(os.path.join(OUT, 'logo-card-transparent-1200.png'))

    # ---------- 3. App 图标 / favicon ----------
    ICON_BG = (255, 255, 255, 255)

    def icon(size, out):
        c = Image.new('RGBA', (size, size), ICON_BG)
        inner = int(size * 0.88)
        lg = fit(logo, inner, inner)
        c.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
        c.convert('RGB').resize((size, size), Image.LANCZOS).save(out)

    for s in (1024, 512, 192):
        icon(s, os.path.join(OUT, f'app-icon-{s}.png'))
    icon(180, os.path.join(OUT, 'apple-touch-icon-180.png'))
    for s in (64, 32, 16):
        icon(s, os.path.join(OUT, f'favicon-{s}.png'))

    # ---------- 4. 启动页 1242x2688 ----------
    W, H = 1242, 2688
    sp = Image.new('RGBA', (W, H), INK)
    d = ImageDraw.Draw(sp)

    # 左上速度线（放在文字和卡片之上，留出安全距离）
    for y, w in ((210, 200), (268, 286), (326, 142)):
        d.rounded_rectangle((78, y, 78 + w, y + 18), radius=9, fill=(245, 179, 1, 235))
    # 右下黄圆（贴边，做节奏）
    d.ellipse((880, 2010, 1580, 2710), fill=YELLOW)

    cw = 880
    cd = white_card(logo, cw, pad_ratio=0.075, radius_ratio=0.10)
    sp.alpha_composite(cd, ((W - cw) // 2, 450))

    fs, size = fit_two(SLOGAN_1, SLOGAN_2, F_DISPLAY, 122, 980)
    d.text((W / 2, 1462), SLOGAN_1, font=fs, fill=WHITE, anchor='mm')
    d.text((W / 2, 1462 + int(size * 1.08)), SLOGAN_2, font=fs, fill=YELLOW, anchor='mm')
    d.text((W / 2, 1712), SERVICES, font=font(F_UI, 34), fill=SOFT, anchor='mm')
    d.text((W / 2, 2452), '订单 · 账单 · 收款 · 一部手机管完',
           font=font(F_UI_B, 28), fill=(168, 168, 174, 255), anchor='mm')
    sp.convert('RGB').save(os.path.join(OUT, 'splash-1242x2688.png'))

    # ---------- 5. 登录主视觉 1200x800 ----------
    # 横版图不再放速度线：完整 logo 里已经有速度线，重复会压到标语
    W, H = 1200, 800
    hero = Image.new('RGBA', (W, H), INK)
    d = ImageDraw.Draw(hero)
    d.polygon([(0, 742), (250, 662), (250, 704), (0, 800)], fill=(245, 179, 1, 40))

    cw = 540
    cd = white_card(logo, cw, pad_ratio=0.075, radius_ratio=0.10)
    hero.alpha_composite(cd, (W - cw - 56, (H - cw) // 2))

    fs, size = fit_two(SLOGAN_1, SLOGAN_2, F_DISPLAY, 94, 478)
    d.text((76, 168), SLOGAN_1, font=fs, fill=WHITE)
    d.text((76, 168 + int(size * 1.16)), SLOGAN_2, font=fs, fill=YELLOW)
    d.text((80, 452), SERVICES, font=font(F_UI, 26), fill=SOFT)
    d.text((80, 500), '订单 · 账单 · 收款 · 一部手机管完', font=font(F_UI_B, 23), fill=YELLOW)
    hero.convert('RGB').save(os.path.join(OUT, 'login-hero-1200x800.png'))

    # ---------- 6. 分享封面 1200x630 ----------
    W, H = 1200, 630
    og = Image.new('RGBA', (W, H), INK)
    d = ImageDraw.Draw(og)
    d.ellipse((880, -160, 1520, 480), fill=YELLOW)
    d.polygon([(0, 600), (180, 548), (180, 578), (0, 630)], fill=(245, 179, 1, 40))

    cw = 450
    cd = white_card(logo, cw, pad_ratio=0.075, radius_ratio=0.10)
    og.alpha_composite(cd, (W - cw - 52, (H - cw) // 2))

    fs, size = fit_two(SLOGAN_1, SLOGAN_2, F_DISPLAY, 82, 566)
    d.text((78, 152), SLOGAN_1, font=fs, fill=WHITE)
    d.text((78, 152 + int(size * 1.16)), SLOGAN_2, font=fs, fill=YELLOW)
    d.text((80, 392), SERVICES, font=font(F_UI, 22), fill=SOFT)
    d.text((80, 432), '订单 · 账单 · 收款 · 一部手机管完', font=font(F_UI_B, 21), fill=(240, 240, 244, 255))
    og.convert('RGB').save(os.path.join(OUT, 'og-cover-1200x630.png'))

    # ---------- 7. 移动端头图 1500x600 ----------
    W, H = 1500, 600
    bn = Image.new('RGBA', (W, H), INK)
    d = ImageDraw.Draw(bn)
    d.ellipse((1120, -180, 1800, 500), fill=YELLOW)
    d.polygon([(0, 574), (170, 522), (170, 552), (0, 600)], fill=(245, 179, 1, 40))

    cw = 430
    cd = white_card(logo, cw, pad_ratio=0.075, radius_ratio=0.10)
    bn.alpha_composite(cd, (W - cw - 70, (H - cw) // 2))

    fs, size = fit_two(SLOGAN_1, SLOGAN_2, F_DISPLAY, 92, 856)
    d.text((76, 158), SLOGAN_1, font=fs, fill=WHITE)
    d.text((76, 158 + int(size * 1.16)), SLOGAN_2, font=fs, fill=YELLOW)
    d.text((78, 420), '接单 · 跑腿 · 记账单', font=font(F_UI, 28), fill=SOFT)
    bn.convert('RGB').save(os.path.join(OUT, 'mobile-banner-1500x600.png'))

    # ---------- 8. 账单图片品牌头 1200x240（后端兜底出图用） ----------
    W, H = 1200, 240
    bh = Image.new('RGBA', (W, H), WHITE)
    d = ImageDraw.Draw(bh)
    lg = fit(logo, 170, 170)
    bh.alpha_composite(lg, (48, (H - lg.height) // 2))
    d.line((250, 56, 250, 184), fill=(226, 232, 240, 255), width=2)
    d.text((282, 74), SLOGAN_FULL, font=fit_font(SLOGAN_FULL, F_DISPLAY, 46, 860), fill=INK)
    d.text((284, 148), SERVICES, font=font(F_UI, 22), fill=GRAY)
    bh.convert('RGB').save(os.path.join(OUT, 'bill-header-1200x240.png'))

    print('done ->', OUT)


if __name__ == '__main__':
    build()
