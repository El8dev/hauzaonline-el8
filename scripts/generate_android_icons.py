import os
import sys
from PIL import Image

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGO = os.path.join(BASE_DIR, "public", "logo.png")
RES_DIR = os.path.join(BASE_DIR, "android", "app", "src", "main", "res")

# Mipmap densities and sizes (launcher icon size in px)
SIZES = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

def generate_icons():
    if not os.path.exists(SRC_LOGO):
        print(f"Source logo not found at {SRC_LOGO}")
        return

    img = Image.open(SRC_LOGO).convert("RGBA")
    
    # 1. Generate Google Play Store 512x512 icon
    play_store_icon = img.resize((512, 512), Image.Resampling.LANCZOS)
    play_store_path = os.path.join(BASE_DIR, "android", "play_store_icon_512.png")
    play_store_icon.save(play_store_path, "PNG")
    print(f"Generated Play Store Icon (512x512): {play_store_path}")

    # 2. Generate mipmap launcher and foreground icons
    for folder, (launcher_size, fg_size) in SIZES.items():
        target_dir = os.path.join(RES_DIR, folder)
        os.makedirs(target_dir, exist_ok=True)

        # Standard launcher icon
        launcher_img = img.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
        launcher_img.save(os.path.join(target_dir, "ic_launcher.png"), "PNG")
        launcher_img.save(os.path.join(target_dir, "ic_launcher_round.png"), "PNG")

        # Foreground for adaptive icon (with 15% inner padding so logo is not clipped by circle/squircle masks)
        fg_canvas = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        padded_size = int(fg_size * 0.72)
        offset = (fg_size - padded_size) // 2
        fg_logo = img.resize((padded_size, padded_size), Image.Resampling.LANCZOS)
        fg_canvas.paste(fg_logo, (offset, offset))
        fg_canvas.save(os.path.join(target_dir, "ic_launcher_foreground.png"), "PNG")

        print(f"Generated icons for {folder}: {launcher_size}px, FG: {fg_size}px")

    # Update ic_launcher_background.xml to match logo background (#000000)
    bg_xml_path = os.path.join(RES_DIR, "values", "ic_launcher_background.xml")
    with open(bg_xml_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')
    print("Updated ic_launcher_background.xml to #000000")

if __name__ == "__main__":
    generate_icons()
