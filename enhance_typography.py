import re

def enhance_typography():
    html_path = 'index.html'
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
        
    # Apply fluid-p and max-text-width to <p> tags
    # We will just add the classes if not already present
    def replace_p(match):
        attrs = match.group(1)
        if 'class="' in attrs:
            if 'fluid-p' not in attrs:
                attrs = attrs.replace('class="', 'class="fluid-p max-text-width ')
        else:
            attrs += ' class="fluid-p max-text-width"'
        return f'<p{attrs}>'

    html = re.sub(r'<p([^>]*)>', replace_p, html)
    
    # Apply fluid-h1 to <h1> tags
    def replace_h1(match):
        attrs = match.group(1)
        if 'class="' in attrs:
            if 'fluid-h1' not in attrs:
                attrs = attrs.replace('class="', 'class="fluid-h1 ')
        else:
            attrs += ' class="fluid-h1"'
        return f'<h1{attrs}>'

    html = re.sub(r'<h1([^>]*)>', replace_h1, html)
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == "__main__":
    enhance_typography()
    print("Typography enhanced.")
