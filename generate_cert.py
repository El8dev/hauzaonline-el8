import os
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

def fix_arabic(text):
    # PIL now natively supports Arabic text shaping and bidi layout via libraqm.
    # The previous approach of using arabic_reshaper and bidi.algorithm
    # caused double-reversing and disconnected characters.
    return text

def generate_certificate():
    font_path = "C:/Windows/Fonts/arial.ttf"
    if not os.path.exists(font_path):
        font_path = "C:/Windows/Fonts/tahoma.ttf"

    base_image_path = "5429417628490471165.jpg"
    img = Image.open(base_image_path)
    draw = ImageDraw.Draw(img)

    # Use a large font for the name
    name_font = ImageFont.truetype(font_path, 40)
    grade_font = ImageFont.truetype(font_path, 25)
    final_grade_font = ImageFont.truetype(font_path, 30)

    # 1. Name
    name_text = "طالبة تجريبية - زينب محمد"
    bidi_name = fix_arabic(name_text)
    
    img_width, img_height = img.size
    
    # Calculate name pos. JS says right: 38%, top: 37%
    # right: 38% means right edge of text should be at 100% - 38% = 62%
    # In Pillow we use top-left. Let's get text bounding box.
    bbox = draw.textbbox((0, 0), bidi_name, font=name_font)
    text_width = bbox[2] - bbox[0]
    
    name_x = (img_width * 0.62) - text_width
    name_y = img_height * 0.345
    draw.text((name_x, name_y), bidi_name, font=name_font, fill=(0, 0, 0))

    # 2. Grades (7 subjects/grades)
    # right: 65% -> right edge at 35% of width
    grades = [
        ("العقائد", "100"),
        ("الفقه", "95"),
        ("المنطق", "90"),
        ("الأخلاق", "88"),
        ("النحو", "92"),
        ("السلوك", "99"),
    ]
    
    # Draw individual grades
    start_y_pct = 0.565
    for i, (subj, grade) in enumerate(grades):
        grade_text = fix_arabic(grade)
        bbox = draw.textbbox((0, 0), grade_text, font=grade_font)
        gw = bbox[2] - bbox[0]
        gx = (img_width * 0.28) - gw
        gy = img_height * (start_y_pct + (i * 0.034))
        draw.text((gx, gy), grade_text, font=grade_font, fill=(0, 0, 0))
        
    # Draw Final Grade (cert-grade-7)
    final_text = fix_arabic("امتياز (94%)")
    bbox = draw.textbbox((0, 0), final_text, font=final_grade_font)
    fw = bbox[2] - bbox[0]
    fx = (img_width * 0.28) - fw
    fy = img_height * 0.768
    draw.text((fx, fy), final_text, font=final_grade_font, fill=(153, 27, 27)) # #991b1b

    output_path = "generated_certificate.jpg"
    img.save(output_path)
    print("Certificate with grades generated.")

if __name__ == "__main__":
    generate_certificate()
