import os
import sys
from PIL import Image, ImageDraw, ImageFont

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGO = os.path.join(BASE_DIR, "public", "logo.png")
OUT_PATH = os.path.join(BASE_DIR, "android", "play_store_feature_graphic_1024x500.png")

def create_feature_graphic():
    width, height = 1024, 500
    # Create dark gradient/solid background (#0f172a / deep elegant navy-black)
    banner = Image.new("RGB", (width, height), (15, 23, 42))
    draw = ImageDraw.Draw(banner)

    # Subtle decorative borders & glow
    draw.rectangle([0, 0, width, height], fill=(13, 17, 23))
    # Elegant top/bottom thin golden lines
    draw.line([(0, 2), (width, 2)], fill=(212, 175, 55), width=4)
    draw.line([(0, height - 3), (width, height - 3)], fill=(212, 175, 55), width=4)

    # Load and place logo
    if os.path.exists(SRC_LOGO):
        logo = Image.open(SRC_LOGO).convert("RGBA")
        logo_size = 340
        logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        logo_x = int(width * 0.72) - (logo_size // 2)
        logo_y = (height - logo_size) // 2
        banner.paste(logo, (logo_x, logo_y), logo)

    # Typography on the left side
    font_bold = "C:/Windows/Fonts/tradbdo.ttf"
    font_reg = "C:/Windows/Fonts/arial.ttf"
    if not os.path.exists(font_bold):
        font_bold = font_reg

    title_font = ImageFont.truetype(font_bold, 44)
    sub_font = ImageFont.truetype(font_reg, 24)
    badge_font = ImageFont.truetype(font_reg, 18)

    title_text = "حوزة أم البنين النسوية"
    sub_text = "منصة تعليمية إلكترونية متكاملة"
    badge_text = "الامتحانات • الحضور والغياب • الشهادات المعتمدة"

    draw.text((80, 140), title_text, font=title_font, fill=(248, 250, 252))
    draw.text((80, 220), sub_text, font=sub_font, fill=(212, 175, 55))
    draw.text((80, 290), badge_text, font=badge_font, fill=(148, 163, 184))

    banner.save(OUT_PATH, "PNG")
    print(f"Generated 1024x500 Feature Graphic at: {OUT_PATH}")

if __name__ == "__main__":
    create_feature_graphic()
