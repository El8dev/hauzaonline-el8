import re

html_path = 'index.html'
js_path = 'src/main.js'

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Let's see if the creators modal is defined dynamically in JS
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

print("--- JS CREATORS LOGIC ---")
# Find the exact DOM generation logic for the creators modal
creators_funcs = re.findall(r'(function\s+[^\(]*creator.*?\n\{.*?\n\})', js, re.I | re.S)
for func in creators_funcs:
    print(func[:1000])

creators_btn_event = re.findall(r'getElementById\([\'"]top-right-creators-btn[\'"]\)\.addEventListener.*?\{.*?\}', js, re.I | re.S)
if creators_btn_event:
    print(creators_btn_event[0][:1500])
