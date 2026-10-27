import json,re
t=open('app_template.html').read()
css=open('package/dist/leaflet.css').read()
css="\n".join(l for l in css.splitlines() if 'url(' not in l)
basemap=open('basemap.json').read()
sample=json.dumps(json.load(open('entrega1.json')),ensure_ascii=False,separators=(',',':'))
t=(t.replace('/*__LEAFLET_CSS__*/',css).replace('/*__BASEMAP__*/null',basemap).replace('/*__SAMPLE__*/[]',sample)
   .replace('/*__SCENARIOS__*/[]',open('scenarios.json').read()).replace('/*__SITES__*/[]',open('sites.json').read()).replace('/*__SURVEYS__*/[]',open('surveys.json').read()).replace('/*__STATIONS__*/[]',open('stations.json').read()).replace('/*__HYDRO__*/null',open('hydro.json').read()))
logo='<img class="logo" alt="ANDE" src="data:image/png;base64,'+open('logo.b64').read()+'">'
open('censo_hidrosocial.html','w').write(t.replace('<!--__LOGO__-->',''))
full='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'+t.replace('<!--__LOGO__-->',logo)+'</body></html>'
open('censo_hidrosocial_independiente.html','w').write(full)
import os;print(os.path.getsize('censo_hidrosocial.html'), os.path.getsize('censo_hidrosocial_independiente.html'))
