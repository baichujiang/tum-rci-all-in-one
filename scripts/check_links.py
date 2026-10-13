#!/usr/bin/env python3
"""Optional online link check. No dependencies beyond Python stdlib.

Conservative status: HTTP 401/403/429 = access wall/possible throttling, NOT dead.
The tool only checks requested URLs and does NOT infer RCI rule validity.
"""
import argparse,csv,time,urllib.request,urllib.error,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--limit',type=int,default=25);p.add_argument('--sleep',type=float,default=0.25);p.add_argument('--timeout',type=float,default=8.0);p.add_argument('--output',default='data/link_check_latest.csv');p.add_argument('--fail-on-dead',action='store_true')
a=p.parse_args()
with (root/'data/resources.csv').open(encoding='utf-8-sig',newline='') as f: source=list(csv.DictReader(f))
seen=set();u=[]
for item in source:
    if item['url'] not in seen:
        seen.add(item['url']);u.append(item)
results=[]
for x in u[:a.limit]:
    url=x['url'];status='UNKNOWN';detail=''
    for method in ('HEAD','GET'):
        try:
            req=urllib.request.Request(url,method=method,headers={'User-Agent':'TUM-RCI-hub-link-check/1.0 (educational, polite)'})
            with urllib.request.urlopen(req,timeout=a.timeout) as resp:
                code=resp.status; status='OK' if code<400 else 'REVIEW'; detail=f'HTTP {code}'; break
        except urllib.error.HTTPError as ex:
            code=ex.code
            ex.close()
            if code in (401,403,429):status='LOGIN_OR_BLOCKED';detail=f'HTTP {code}';break
            if code in (404,410):
                detail=f'HTTP {code}'
                if method=='HEAD':continue
                status='POSSIBLY_DEAD';break
            detail=f'HTTP {code}'
        except Exception as ex:
            detail=str(ex)[:140]
    results.append({'id':x['id'],'url':url,'status':status,'detail':detail})
    print(f'{x["id"]} {status:18} {url}')
    time.sleep(max(0,a.sleep))
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True)
with out.open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=results[0].keys() if results else ['id','url','status','detail']);w.writeheader();w.writerows(results)
print('Saved:',out,'(403/429/401 and timeouts are not proof of a dead URL)')
if a.fail_on_dead and any(x['status']=='POSSIBLY_DEAD' for x in results):sys.exit(1)
