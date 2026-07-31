import re

def fix_all_grids():
    css_path = 'style.css'
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    # Make .role-card-container smarter across the board using auto-fit
    css = re.sub(
        r'\.role-card-container\s*\{[^}]*display:\s*grid;[^}]*\}',
        '.role-card-container {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\n  gap: 1.5rem;\n  width: 100%;\n  margin-top: 1.5rem;\n  margin-bottom: 2rem;\n}', 
        css
    )
    
    # Also clean up the media query for role-card-container since auto-fit handles it
    css = re.sub(r'@media\s*\(\s*min-width:\s*768px\s*\)\s*\{\s*\.role-card-container\s*\{[^}]*\}\s*\}', '', css)

    # Ensure flex-row wraps smartly instead of breaking layouts
    if 'flex-wrap: wrap;' not in css.split('.flex-row {')[1][:100]:
        css = css.replace('.flex-row {\n  display: flex;\n  gap: 1rem;\n}', '.flex-row {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n}')

    smart_grid_overrides = """
/* --- UNIVERSAL SMART GRIDS --- */
/* Ensure flex rows wrap on small screens and their children don't stretch indefinitely */
@media (max-width: 767px) {
  .flex-row > * {
    flex: 1 1 100% !important; /* Stack vertically on very small screens */
    min-width: 100% !important;
  }
  
  /* Make sure exam lists and generic card containers wrap nicely */
  #exams-list-container, #student-exams-list-container {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)) !important;
    gap: 1rem !important;
  }
}
"""
    if 'UNIVERSAL SMART GRIDS' not in css:
        css += smart_grid_overrides
        
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css)

if __name__ == "__main__":
    fix_all_grids()
    print("Grids made smarter globally.")
