from PIL import Image, ImageDraw
base_image_path = "5429417628490471165.jpg"
img = Image.open(base_image_path)
draw = ImageDraw.Draw(img)
img_width, img_height = img.size

# Draw lines from 0.55 to 0.80 every 0.01
for pct in range(55, 82):
    y = img_height * (pct / 100.0)
    draw.line([(0, y), (img_width, y)], fill=(255, 0, 0), width=2)
    draw.text((10, y - 10), str(pct) + "%", fill=(255, 0, 0))

img.save("grid_test.jpg")
