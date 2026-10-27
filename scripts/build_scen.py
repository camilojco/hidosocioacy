import json
from kmlparse import parse, tr
from shapely.ops import unary_union, transform
from shapely.geometry import mapping
def rnd(o,nd=5):
    if isinstance(o,(list,tuple)):
        if o and isinstance(o[0],(int,float)): return [round(o[0],nd),round(o[1],nd)]
        return [rnd(x,nd) for x in o]
    return o
out=[]
for f,q in [('071e0be6-Q700',700),('73a2eb8a-Q1400',1400),('fcf51d6d-Q2300',2300),('901b086c-Q2900',2900)]:
    g=unary_union([gg for d,gg in parse(f'kml/{f}.kml')])
    area=transform(tr,g).area/1e6
    gs=g.simplify(0.00004,preserve_topology=True)
    m=mapping(gs)
    out.append({"id":f"Q{q}","nombre":f"Q{q}","valor":q,"area_km2":round(area,2),"archivo":f.split('-',1)[1]+".kml","embebido":True,
                "geom":{"type":m["type"],"coordinates":rnd(m["coordinates"])}})
json.dump(out,open('scenarios.json','w'),separators=(',',':'))
# cauce de referencia (Q700, más simplificado) para la cartografía base
g=unary_union([gg for d,gg in parse('kml/071e0be6-Q700.kml')]).simplify(0.00008,preserve_topology=True)
b=json.load(open('basemap.json'))
b['rios']['features']=[f for f in b['rios']['features'] if f['properties']['nombre']!='Río Acaray']
m=mapping(g)
b['cauceAcaray']={"type":"FeatureCollection","features":[{"type":"Feature","properties":{"nombre":"Río Acaray (cauce de referencia)"},"geometry":{"type":m["type"],"coordinates":rnd(m["coordinates"])}}]}
json.dump(b,open('basemap.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print(os.path.getsize('scenarios.json'), os.path.getsize('basemap.json'))
