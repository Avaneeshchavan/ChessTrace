import os
import re

d = "/Users/avaneeshchavan/VS Code/ChessTrace/chesstrace-phase3/src/components/Board/pieces"

white_grad = '''<defs>
  <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="100%" stop-color="#d6ccb3"/>
  </linearGradient>
</defs>'''

black_grad = '''<defs>
  <linearGradient id="bGrad" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#3a3f44"/>
    <stop offset="100%" stop-color="#1c1f1a"/>
  </linearGradient>
</defs>'''

for f in os.listdir(d):
    if not f.endswith(".svg"): continue
    path = os.path.join(d, f)
    with open(path) as file:
        content = file.read()
    
    # Remove existing defs if present so we can run multiple times safely
    content = re.sub(r'<defs>.*?</defs>', '', content, flags=re.DOTALL)
    
    if f.startswith("w"):
        content = re.sub(r'(<svg[^>]*>)', r'\1' + white_grad, content)
        content = re.sub(r'fill="url\(#wGrad\)"', '', content)
        content = re.sub(r'fill="#[0-9a-fA-F]{6}"', 'fill="url(#wGrad)"', content)
    else:
        content = re.sub(r'(<svg[^>]*>)', r'\1' + black_grad, content)
        content = re.sub(r'fill="url\(#bGrad\)"', '', content)
        content = re.sub(r'fill="#[0-9a-fA-F]{6}"', 'fill="url(#bGrad)"', content)
        
    content = content.replace('stroke-linejoin="miter"', '')
    content = content.replace('stroke-linejoin="round"', '')
    content = content.replace('stroke-linecap="round"', '')
    content = content.replace('stroke-width="2"', 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
    
    # clean up extra spaces
    content = re.sub(r'\s+', ' ', content)
    
    with open(path, "w") as file:
        file.write(content)
