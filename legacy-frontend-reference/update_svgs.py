import os
import re

d = "/Users/avaneeshchavan/VS Code/ChessTrace/chesstrace-phase3/src/components/Board/pieces"
for f in os.listdir(d):
    if not f.endswith(".svg"): continue
    path = os.path.join(d, f)
    with open(path) as file:
        content = file.read()
    
    if f.startswith("b"):
        content = re.sub(r'stroke="[^"]*"', 'stroke="#d1d5db"', content)
        content = re.sub(r'stroke-width="[^"]*"', 'stroke-width="2"', content)
    elif f.startswith("w"):
        content = re.sub(r'stroke="[^"]*"', 'stroke="#1a1d24"', content)
        content = re.sub(r'stroke-width="[^"]*"', 'stroke-width="2"', content)
        
    with open(path, "w") as file:
        file.write(content)
