import re

def fix_performance_and_scale():
    css_path = 'style.css'
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    # 1. Performance fix: Disable heavy backdrop filters on mobile
    if '@media (max-width: 767px)' not in css:
        mobile_optimizations = """
/* --- Mobile Specific Performance and Sizing Tweaks --- */
@media (max-width: 767px) {
  :root {
    --card-backdrop: none !important; /* Disable blur on mobile for performance */
    --card-bg: rgba(255, 255, 255, 0.98); /* Solidify background instead of blur */
    --font-size-base: 0.9rem; /* Make text smaller on phone */
    --font-size-lg: 1rem;
    --font-size-xl: 1.15rem;
    --font-size-2xl: 1.3rem;
  }
  
  body.dark-theme {
    --card-bg: rgba(15, 20, 36, 0.98);
  }

  .form-card {
    padding: 1.25rem 1rem !important; /* Smaller card padding */
  }

  .role-card {
    padding: 1.5rem 1rem !important; /* Smaller card padding */
  }
  
  .btn-primary, .btn-secondary, .text-input {
    padding: 0.6rem 1rem !important; /* Smaller button padding */
    font-size: 0.9rem !important; /* Smaller text on buttons */
  }
  
  .card-title {
    font-size: 1.1rem !important;
  }
}
"""
        css += mobile_optimizations
        
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)

def check_js_for_lag():
    js_path = 'src/main.js'
    with open(js_path, 'r', encoding='utf-8') as f:
        js = f.read()
    
    # Are there particles?
    if 'particles' in js.lower() or 'canvas' in js.lower():
        print("There might be canvas/particles causing lag.")

if __name__ == "__main__":
    fix_performance_and_scale()
    check_js_for_lag()
    print("Done")
