import re

def fix_performance_and_scale2():
    css_path = 'style.css'
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    # We will append more aggressive mobile overrides
    aggressive_mobile_optimizations = """
/* --- AGGRESSIVE MOBILE OVERRIDES --- */
@media (max-width: 767px) {
  :root {
    --font-size-base: 0.75rem !important; /* Even smaller text */
    --font-size-lg: 0.85rem !important;
    --font-size-xl: 1rem !important;
    --font-size-2xl: 1.15rem !important;
  }
  
  .form-card, .role-card {
    padding: 1rem 0.75rem !important; /* Very small padding */
  }
  
  .btn-primary, .btn-secondary, .text-input {
    padding: 0.5rem 0.75rem !important;
    font-size: 0.8rem !important;
  }
  
  /* The creators modal specifically */
  #creators-modal .modal-content, .elite-card, .creator-row {
    transform: scale(0.5) !important; /* 2x smaller */
    transform-origin: top center !important;
    margin-bottom: -50% !important; /* Adjust flow so it doesn't leave huge gaps */
  }

  /* Kill ALL animations, box-shadows, and heavy effects on mobile globally for performance */
  *, *::before, *::after {
    animation: none !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  
  #creators-modal, #creators-modal .modal-content {
    background: #ffffff !important; /* Solid color, no transparency */
  }
  
  body.dark-theme #creators-modal, body.dark-theme #creators-modal .modal-content {
    background: #06080F !important;
  }
}
"""
    css += aggressive_mobile_optimizations
        
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)

if __name__ == "__main__":
    fix_performance_and_scale2()
    print("Done")
