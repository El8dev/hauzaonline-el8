import re

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Look for creators modal classes
matches = re.findall(r'\.creator[^\{]*\{[^\}]*\}', css, re.I | re.S)
print("CSS Classes:")
for m in matches[:5]:
    print(m)

with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Look for creators modal JS
matches2 = re.findall(r'creators', js, re.I)
print("JS Matches count:", len(matches2))
