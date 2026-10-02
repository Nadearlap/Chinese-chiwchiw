import re,os,urllib.parse
HERE=os.path.dirname(os.path.abspath(__file__))
t=open(os.path.join(HERE,'template.html'),encoding='utf-8').read()
def ph(path,w,h):
    p='/'.join(urllib.parse.quote(x) for x in ('chinesechiwchiw.com/wp-content/uploads/'+path).split('/'))
    return f'https://i0.wp.com/{p}?resize={w}%2C{h}&ssl=1'
t=re.sub(r'\{\{P:([^:}]+):(\d+):(\d+)\}\}',lambda m:ph(m.group(1),m.group(2),m.group(3)),t)
ICON={
 'yt':'<svg viewBox="0 0 24 24"><rect x="1.4" y="4.4" width="21.2" height="15.2" rx="4.6" fill="currentColor"/><path d="M9.8 8.7v6.6l5.8-3.3z" fill="#1A0A00"/></svg>',
 'ig':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.6"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.7" cy="6.3" r="1.3" fill="currentColor" stroke="none"/></svg>',
 'tt':'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
 'fb':'<svg viewBox="0 0 20 20"><path fill="currentColor" d="M20 10.1C20 4.5 15.5.1 10 .1S0 4.5 0 10.1c0 5 3.7 9.1 8.4 9.9v-7H5.9v-2.9h2.5V7.9C8.4 5.4 9.9 4 12.2 4c1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6v1.9h2.8l-.4 2.8h-2.3v7c4.7-.8 8.4-4.9 8.4-9.9z"/></svg>'}
S=[('yt','YouTube','Nadear Lap-itti','https://www.youtube.com/watch?v=FjnlVifu2Wo','#FF0000','ดู vlog ชีวิตเดียร์ได้'),
   ('ig','Instagram','@nadearlap','https://www.instagram.com/nadearlap/','#DD2A7B','อัปเดต memories'),
   ('tt','TikTok','@nadearsdiary','https://www.tiktok.com/@nadearsdiary','#111111','ช่องสำหรับการศึกษา & mindset'),
   ('fb','Facebook','Nadear Lap-itti','https://www.facebook.com/nadear.lap.itti.2025/','#1877F2','อ่าน blog เดียร์ได้')]
AH='<svg aria-hidden="true" '
def ic(k,c=None):
    v=ICON[k].replace('<svg ',AH)
    return v.replace('fill="#1A0A00"','fill="'+c+'"') if c else v
# original-style filled brand icons for the hero buttons
HI={'yt':'<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
 'ig':'<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>',
 'tt':'<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.79 1.53V6.76a4.85 4.85 0 0 1-1.02-.07z"/>',
 'fb':'<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>'}
hero=''.join('<a class="nd-sbtn %s" href="%s" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true">%s</svg>%s</a>'%(k,u,HI[k],n) for k,n,h,u,c,d in S)
cards=''.join('\n      <a class="nd-sc nd-rv" href="%s" target="_blank" rel="noopener" style="--c:%s"><i style="color:#fff">%s</i><span><b>%s</b><small>%s</small><em>%s</em></span></a>'%(u,c,ic(k,c),n,h,d) for k,n,h,u,c,d in S)
# MY LIFE slider: (path, alt, orientation p=portrait / l=landscape). Dear's new photos (nadearlap*) mixed with the originals.
N='2026/10/nadearlap'
SL=[(N+'.webp','ปาร์ตี้คริสต์มาสกับเพื่อน ๆ','l'),(N+'5.jpg','ช่อดอกไม้','p'),('2026/03/IMG_2337.jpg','บนเวทีงาน ไปจีนกับ Chinese Chiwchiw','p'),
    (N+'2.webp','ตีเทนนิส','p'),(N+'11.jpg','กับทีมและพาร์ทเนอร์','l'),(N+'1.webp','งานวาดรูป','p'),('2026/03/Nadear-grad-pic-edited.jpg','LSE graduation','p'),
    (N+'8.jpg','บนเวที Study Abroad Fair','p'),(N+'6.jpg','เที่ยวที่จีน','l'),(N+'3.jpg','ถ่าย vlog','p'),('2026/03/548925591_18053538578538044_6332023643666926458_n.jpg','มอบทุน Chinese Chiwchiw','l'),
    (N+'14.jpg','รับปริญญาริมแม่น้ำเทมส์','p'),(N+'12.jpg','กับน้อง ๆ ในงาน','l'),(N+'7.jpg','กับเพื่อน','p'),(N+'10.jpg','กับน้อง ๆ งาน ไปจีนกับ Chinese Chiwchiw','p'),
    ('2026/03/IMG_8543-1-e1773578097737.jpg','New York','p'),(N+'9.jpg','เจอพาร์ทเนอร์','p'),(N+'16.jpg','กินข้าวกับน้อง ๆ','p'),('2026/03/IMG_7712.jpg','ตีกอล์ฟ','p'),
    (N+'13.jpg','วันรับปริญญา','p'),(N+'15.jpg','ให้คำปรึกษาผู้ปกครองและน้อง ๆ','l'),('2026/03/IMG_5057.jpg','Los Angeles','l'),('2026/03/IMG_2269-1.jpg','กับน้อง ๆ ในงานแนะแนว','p'),
    ('2026/03/6C210327-B2EE-40C5-B56F-0914123DD681_1_102_o.jpg','รับปริญญาที่ลอนดอน','p'),('2026/03/IMG_1274.jpg','Harvard','p'),('2026/03/IMG_6007.jpg','กับน้อง ๆ ค่ายจีน','p')]
def slide(p,a,o):
    w,h=(460,340) if o=='l' else (290,380)
    return '<div class="nd-slide nd-s%s"><img src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async"></div>'%(o,ph(p,w,h),a,w,h)
slides=''.join(slide(*x) for x in SL)
t=t.replace('{{HERO_SOCIAL}}',hero).replace('{{SOCIAL_CARDS}}',cards).replace('{{SLIDES}}',slides)
assert '{{' not in t
t=t.replace(' ๆ',' ๆ')
for js in re.findall(r'<script>(.*?)</script>',t,re.S):
    assert '<' not in js,[js[m.start()-30:m.start()+20] for m in re.finditer('<',js)]
out=os.path.join(HERE,'../../pages/founder.html')
open(out,'w',encoding='utf-8').write(t);print('ok',len(t)//1024,'KB')
