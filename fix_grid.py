import re

def fix_services_grid():
    css_path = 'style.css'
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    fixes = """
/* --- SERVICES GRID MOBILE FIXES --- */
@media (max-width: 767px) {
  .services-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 0.5rem !important;
    margin-bottom: 1.5rem !important;
  }
  .service-card {
    flex-direction: column !important;
    text-align: center !important;
    padding: 0.75rem !important;
    gap: 0.5rem !important;
    border-radius: 12px !important;
  }
  .service-icon {
    font-size: 1.5rem !important;
    padding: 0.4rem !important;
  }
  .service-text {
    font-size: 0.75rem !important;
    line-height: 1.3 !important;
  }
  .service-card[style*="grid-column"] {
    grid-column: span 2 !important; 
  }
}
"""
    css += fixes
        
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)

if __name__ == "__main__":
    fix_services_grid()
    print("Done")
