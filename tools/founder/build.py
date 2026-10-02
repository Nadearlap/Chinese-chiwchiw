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
S=[('yt','YouTube','Nadear Lap-itti','https://www.youtube.com/watch?v=FjnlVifu2Wo','#FF0000'),
   ('ig','Instagram','@nadearlap','https://www.instagram.com/nadearlap/','#DD2A7B'),
   ('tt','TikTok','@nadearsdiary','https://www.tiktok.com/@nadearsdiary','#111111'),
   ('fb','Facebook','Nadear Lap-itti','https://www.facebook.com/nadear.lap.itti.2025/','#1877F2')]
AH='<svg aria-hidden="true" '
def ic(k,c=None):
    v=ICON[k].replace('<svg ',AH)
    return v.replace('fill="#1A0A00"','fill="'+c+'"') if c else v
icons=''.join('<a href="%s" target="_blank" rel="noopener" aria-label="%s %s" style="color:#FFB300">%s</a>'%(u,n,h,ic(k)) for k,n,h,u,c in S)
cards=''.join('\n      <a class="nd-sc nd-rv" href="%s" target="_blank" rel="noopener" style="--c:%s"><i style="color:#fff">%s</i><span><b>%s</b><small>%s</small></span></a>'%(u,c,ic(k,c),n,h) for k,n,h,u,c in S)
t=t.replace('{{SOCIAL_ICONS}}',icons).replace('{{SOCIAL_CARDS}}',cards)
assert '{{' not in t
t=t.replace(' ๆ',' ๆ')
for js in re.findall(r'<script>(.*?)</script>',t,re.S):
    assert '<' not in js,[js[m.start()-30:m.start()+20] for m in re.finditer('<',js)]
out=os.path.join(HERE,'../../pages/founder.html')
open(out,'w',encoding='utf-8').write(t);print('ok',len(t)//1024,'KB')
