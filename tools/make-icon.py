"""Draws the Desk Phonograph icon (flat style): cabinet, record, tonearm and a brass horn.
Writes app/build/icon.png (512), icon.ico (16-256) and tray.png/tray.ico."""
from PIL import Image, ImageDraw
import math, os
OUT=os.path.join(os.path.dirname(__file__),'..','app','build')
def draw(N=1024):
    im=Image.new('RGBA',(N,N),(0,0,0,0));g=ImageDraw.Draw(im);s=N/1024
    S=lambda *v:[x*s for x in v]
    # horn: a flared bell up and to the right, from the back of the cabinet
    g.polygon(S(470,520, 560,470, 860,150, 1000,330, 640,560, 540,600),fill=(201,151,62))
    g.ellipse(S(820,110,1010,370),fill=(232,186,92))
    g.ellipse(S(860,160,975,325),fill=(124,78,26))
    g.polygon(S(470,520,560,470,600,500,520,560),fill=(170,120,45))
    # cabinet
    g.rounded_rectangle(S(110,600,800,930),radius=40*s,fill=(122,58,30))
    g.rounded_rectangle(S(110,600,800,660),radius=20*s,fill=(150,76,40))
    g.rectangle(S(90,915,820,965),fill=(84,38,18))
    g.rounded_rectangle(S(300,730,610,860),radius=18*s,fill=(96,44,22))
    g.ellipse(S(790,720,860,790),fill=(201,151,62))
    # record, seen from slightly above
    g.ellipse(S(130,470,780,650),fill=(22,20,22))
    for k in (0.82,0.64):
        cx,cy,rx,ry=455,560,325*k,90*k
        g.ellipse(S(cx-rx,cy-ry,cx+rx,cy+ry),outline=(70,66,72),width=max(1,int(8*s)))
    g.ellipse(S(375,537,535,583),fill=(196,36,32))
    g.ellipse(S(445,552,465,568),fill=(230,210,170))
    # tonearm
    g.line(S(720,470,600,560),fill=(214,214,220),width=int(26*s))
    g.ellipse(S(690,440,750,500),fill=(214,214,220))
    g.rectangle(S(580,545,615,580),fill=(214,214,220))
    return im
big=draw()
os.makedirs(OUT,exist_ok=True)
big.resize((512,512),Image.LANCZOS).save(os.path.join(OUT,'icon.png'))
big.resize((256,256),Image.LANCZOS).save(os.path.join(OUT,'icon.ico'),sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
big.resize((32,32),Image.LANCZOS).save(os.path.join(OUT,'tray.png'))
big.resize((64,64),Image.LANCZOS).save(os.path.join(OUT,'tray.ico'),sizes=[(16,16),(20,20),(24,24),(32,32),(48,48)])
print('icons written')
