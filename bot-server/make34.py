# Menu.pdf dan taom rasmlarini 3:4 (eni 3, boyi 4) qilib tayyorlaydi: taom toʻliq koʻrinadi,
# yuqori va pastdagi boʻsh joy menyudagi qizil rang bilan toʻldiriladi.
import sys, json
sys.path.insert(0, '.')
from menu_src import ITEMS
from PIL import Image, ImageFilter, ImageEnhance
big = Image.open(sys.argv[1]).convert('RGB'); k = 200/60
W, H = 600, 800
done = {}
for id, cat, uz, ru, price, note, box in ITEMS:
    if box in done: continue
    x1, y1, x2, y2 = [int(v*k) for v in box]
    fg = big.crop((x1, y1, x2, y2))
    bg = Image.new('RGB', (W, H), (122, 16, 16))  # menyudagi qizil fon rangi
    s = min(W/fg.width, H/fg.height)
    fg = fg.resize((int(fg.width*s), int(fg.height*s)), Image.LANCZOS)
    bg.paste(fg, ((W-fg.width)//2, (H-fg.height)//2))
    bg = bg.resize((450, 600), Image.LANCZOS)
    bg.save(f'../bot/img/{id}.jpg', quality=78, optimize=True, progressive=True)
    done[box] = 1
print(len(done))
