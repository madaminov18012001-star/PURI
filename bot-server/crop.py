import json,sys
sys.path.insert(0,'.')
from menu_src import CATS,ITEMS
from PIL import Image
big=Image.open(sys.argv[1]); k=200/60
done={}
out=[]
for id,cat,uz,ru,price,note,box in ITEMS:
    key=box
    if key not in done:
        x1,y1,x2,y2=[int(v*k) for v in box]
        im=big.crop((x1,y1,x2,y2)).convert('RGB')
        im.thumbnail((480,480))
        fn=f"img/{id}.jpg"; im.save('../'+fn,quality=82,optimize=True); done[key]=fn
    out.append(dict(id=id,cat=cat,name=uz,ru=ru,price=price,note=note,img=done[key]))
json.dump(dict(cats=[dict(id=a,name=b) for a,b in CATS],items=out),open('../menu.json','w'),ensure_ascii=False,indent=1)
print(len(out))
