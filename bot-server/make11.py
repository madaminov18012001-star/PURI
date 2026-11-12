# Menu.pdf dan taom rasmlarini kvadrat (1:1) qilib tayyorlaydi. Taom kadrni toʻldiradi:
# keng rasmlarda yon tomonlardan koʻpi bilan 20% kesiladi, qolgan boʻsh joy menyudagi qizil rang.
import sys
sys.path.insert(0, '.')
from menu_src import ITEMS
from PIL import Image
big = Image.open(sys.argv[1]).convert('RGB'); k = 200/60
S = 900
done = {}
for id, cat, uz, ru, price, note, box in ITEMS:
    x1, y1, x2, y2 = [int(v*k) for v in box]
    fg = big.crop((x1, y1, x2, y2))
    s = S / max(min(fg.width, fg.height), 0.8*max(fg.width, fg.height))
    fg = fg.resize((round(fg.width*s), round(fg.height*s)), Image.LANCZOS)
    bg = Image.new('RGB', (S, S), (122, 16, 16))
    bg.paste(fg, ((S-fg.width)//2, (S-fg.height)//2))
    bg.resize((450, 450), Image.LANCZOS).save(f'../bot/img/{id}.jpg', quality=80, optimize=True, progressive=True)
    done[id] = 1
print(len(done))
