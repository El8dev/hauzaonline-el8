import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find the elite-modal or creators-modal
matches = re.findall(r'<div[^>]*class=\"[^\"]*modal[^\"]*\"[^>]*>.*?</div>', html, re.I | re.S)
for m in matches:
    if 'صنع' in m or 'creator' in m.lower() or 'elite' in m.lower():
        print("Found modal HTML snippet:", len(m), "chars")
        print(m[:300])

with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Find creators logic in JS
matches = re.findall(r'function.*?creator.*?\n.*?(?=\n\}|\nfunction)', js, re.I | re.S)
if not matches:
    matches = re.findall(r'document\.getElementById\([\'"]top-right-creators-btn[\'"]\).*?\{.*?\}', js, re.I | re.S)

if matches:
    print("\nFound JS snippet:", len(matches[0]), "chars")
    print(matches[0][:500])
