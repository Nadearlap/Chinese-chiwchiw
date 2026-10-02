import json,html,re,sys
sys.path.insert(0,'.')
from data import *
esc=lambda s:html.escape(s,quote=True)
t=open('template.html',encoding='utf-8').read()
ANN=''.join(f'<span>{x}</span><i>✦</i>' for x in [
 '🎓 เปิดรับสมัคร <b>เทอมมีนาคม 2027</b> — มัดจำเพียง <b>฿25,000</b>',
 '🐼 ค่ายเฉิงตู มี.ค.–พ.ค. 2027 Early Bird เริ่ม <b>฿69,500</b> ถึง 30 ต.ค.',
 '❄️ Chengdu Winter Camp <b>13–26 ธ.ค. 2026</b>',
 '🏅 ทุน 1+4 เรียนต่อปริญญาตรี ไม่ต้องใช้ HSK',
 '✨ ใหม่! <b>Chiwchiw Match</b> หามหาวิทยาลัยจีนด้วย AI'])
stops='';panels=''
for i,(ic,ti,sh,body,link,photo) in enumerate(CARE,1):
    stops+=f'\n      <button class="hm-stop" role="tab" id="hm-s{i}" aria-controls="hm-c{i}" aria-selected="{"true" if i==1 else "false"}"><i aria-hidden="true">{ic}</i><b>{ti}</b><small>{sh}</small></button>'
    panels+=f'''
    <div class="hm-care" role="tabpanel" id="hm-c{i}" aria-labelledby="hm-s{i}">
      <div class="hm-care-img"><img src="{ph(photo,720,520)}" alt="{esc(ti)}" loading="lazy" decoding="async" width="720" height="520"></div>
      <div class="hm-care-body"><span class="hm-care-n">ขั้นที่ {i:02d}</span><h3>{ic} {ti}</h3><p>{body}</p><a class="hm-link" href="https://chinesechiwchiw.com{"/บริการของเรา/" if link in PENDING else link}">ดูรายละเอียด{ti if i!=6 else "บริการทั้งหมด"} →</a></div>
    </div>'''
gal=''.join(f'\n      <figure class="{("hm-g"+z) if z else ""}"><img src="{ph(p,800 if z in ("b","w") else 520)}" alt="{esc(c)}" loading="lazy" decoding="async" width="{800 if z in ("b","w") else 520}" height="600"><figcaption>{c}</figcaption></figure>' for p,c,z in GALLERY)
revs=''.join(f'''
      <article class="hm-rev hm-rv">
        <header><span class="hm-av" style="background-position:0 -{k*46}px" aria-hidden="true"></span><div><b>{esc(n)}</b><small>{esc(r)} · {esc(tg)}</small></div></header>
        <div class="hm-stars" aria-hidden="true">★★★★★</div>
        <p>“{esc(tx)}”</p>
        <footer>รีวิวบน Facebook</footer>
      </article>''' for n,r,tg,tx,k in REVIEWS)
faq=''.join(f'\n      <details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q,a in FAQ)
ld=json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in FAQ]},ensure_ascii=False,indent=1)
R={'{{ANN}}':ANN,'{{STOPS}}':stops,'{{CAREPANELS}}':panels,'{{GALLERY}}':gal,'{{REVIEWS}}':revs,'{{FAQ}}':faq,'{{FAQLD}}':ld,
 '{{HERO1_SM}}':ph(HERO[0],800),'{{HERO1_LG}}':U+HERO[0],'{{HERO2}}':ph(HERO[1],1600),'{{HERO3}}':ph(HERO[2],1600),
 '{{IMG_CAMP}}':ph('2026/09/SWUFE_Chengdu_Camp_ถ่ายรูปป้ายไอเลิฟสวูฟ2-rotated.webp',720,600),
 '{{IMG_LANG}}':ph('2026/09/เรียนภาษาที่ฟู้ตั้นเซี้ยงไฮ้_ถ่ายรูปหน้าตึกกวงหัว_4.webp',720,600),
 '{{IMG_DEGREE}}':ph('2026/09/SCUT_guangzhou_ถ่ายรูปหมู่กับอาจารย์.webp',720,600),
 '{{IMG_ONLINE}}':ph('2026/09/SCUT_guangzhou_ห้องเรียน_2.jpg',720,600),
 '{{SCHOLAR}}':ph('2026/03/548925591_18053538578538044_6332023643666926458_n.webp',700),'{{ROADSHOW}}':ph('2026/03/539655399_1216883620453472_1988846568270268185_n.webp',560,420),'{{FOUNDER}}':ph('2026/10/opt-6C210327-B2EE-40C5-B56F-0914123DD681_1_102_o-6674.webp',560,700)}
for k,v in R.items():
    assert k in t,k; t=t.replace(k,v)
assert '{{' not in t
t=t.replace(' ๆ',' ๆ')
for js in re.findall(r'<script>(.*?)</script>',t,re.S):
    assert '<' not in js, [js[m.start()-30:m.start()+20] for m in re.finditer('<',js)]
open(__import__('os').path.join(__import__('os').path.dirname(__file__),'../../pages/homepage.html'),'w',encoding='utf-8').write(t)
print('ok',len(t)//1024,'KB')
