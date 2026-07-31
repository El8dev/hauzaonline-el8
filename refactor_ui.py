import re

def refactor_css():
    css_path = 'style.css'
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()
    
    # Add fluid typography variables to root
    if '--font-size-base' not in css:
        css = css.replace(':root {', ':root {\n  --font-size-base: clamp(1rem, 1.5vw + 0.5rem, 1.125rem);\n  --font-size-lg: clamp(1.125rem, 2vw + 0.5rem, 1.5rem);\n  --font-size-xl: clamp(1.25rem, 3vw + 0.5rem, 2rem);\n  --font-size-2xl: clamp(1.5rem, 4vw + 0.5rem, 2.5rem);')
    
    # Fix app-wrapper
    css = re.sub(r'\.app-wrapper\s*\{[^}]*max-width:\s*770px;[^}]*\}', 
                 '.app-wrapper {\n  max-width: 1200px;\n  width: 100%;\n  padding: 0 1rem;\n  margin: 0 auto 2rem auto;\n}', css)

    # Fix role-card-container (mobile first)
    css = re.sub(r'\.role-card-container\s*\{[^}]*grid-template-columns:\s*1fr 1fr;[^}]*\}',
                 '.role-card-container {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 20px;\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n@media (min-width: 768px) {\n  .role-card-container {\n    grid-template-columns: 1fr 1fr;\n  }\n}', css)
                 
    # Add min-height to inputs and buttons for tap targets
    if 'min-height: 44px;' not in css:
        css = css.replace('.text-input, .form-control {', '.text-input, .form-control {\n  min-height: 44px;')
        css = css.replace('.btn-primary {', '.btn-primary {\n  min-height: 44px;')
        css = css.replace('.btn-secondary {', '.btn-secondary {\n  min-height: 44px;')
        css = css.replace('.tab-btn {', '.tab-btn {\n  min-height: 44px;')
        
    # Append utility classes
    utils = """
/* Responsive Utility Classes added for Refactor */
.img-fluid {
  max-width: 100%;
  height: auto;
}
.logo-img {
  width: clamp(70px, 15vw, 100px);
  height: auto;
  aspect-ratio: 1/1;
  border-radius: 50%;
  border: 2px solid var(--accent-gold);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}
.max-text-width {
  max-width: 70ch;
  margin-left: auto;
  margin-right: auto;
}
.fluid-h1 {
  font-size: var(--font-size-2xl);
  line-height: 1.2;
}
.fluid-p {
  font-size: var(--font-size-base);
}
.stack-col {
  display: flex;
  flex-direction: column;
}
@media (min-width: 768px) {
  .md-flex-row {
    flex-direction: row;
  }
}
"""
    if '.img-fluid' not in css:
        css += utils
        
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)

def refactor_html():
    html_path = 'index.html'
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
        
    # Remove strict pixel widths from inline styles
    html = re.sub(r'style="([^"]*)width:\s*\d+px;([^"]*)"', lambda m: f'style="{m.group(1)}{m.group(2)}"'.replace('style=""', ''), html)
    html = re.sub(r'style="([^"]*)max-width:\s*\d+px;([^"]*)"', lambda m: f'style="{m.group(1)}{m.group(2)}"'.replace('style=""', ''), html)
    
    # Refactor specific image tags
    html = re.sub(r'<img src="hawzalogo.jpg"([^>]*?)style="[^"]*"([^>]*)>', r'<img src="hawzalogo.jpg"\1 class="logo-img" \2>', html)
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == "__main__":
    refactor_css()
    refactor_html()
    print("Refactoring completed.")
