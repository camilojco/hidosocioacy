import json, pickle, pyproj
from shapely.geometry import shape, mapping, box
from shapely import transform as stf
from shapely.ops import transform
G=pickle.load(open('geo.pkl','rb')); lake=G['lake']
b=json.load(open('basemap.json')); cauce=shape(b['cauceAcaray']['features'][0]['geometry'])
fw=pyproj.Transformer.from_crs(4326,32721,always_xy=True).transform
bw=pyproj.Transformer.from_crs(32721,4326,always_xy=True).transform
def rnd(o,nd=5):
    if isinstance(o,(list,tuple)):
        if o and isinstance(o[0],(int,float)): return [round(o[0],nd),round(o[1],nd)]
        return [rnd(x,nd) for x in o]
    return o
def at_ratio(g,ratio):
    A=g.area
    if abs(ratio-1)<1e-6: return g
    lo,hi=(-3000,0) if ratio<1 else (0,3000)
    for _ in range(40):
        mid=(lo+hi)/2; a=g.buffer(mid,join_style=1).area/A
        if (a<ratio)==(ratio<1): 
            if ratio<1: lo=mid
            else: lo=mid
        else: hi=mid
        if ratio<1:
            # a decreases as mid more negative
            if a<ratio: lo=mid
            else: hi=mid
    return g.buffer((lo+hi)/2,join_style=1)
def at_ratio2(g,ratio):
    A=g.area
    if abs(ratio-1)<1e-6: return g
    if ratio<1: lo,hi=-3000.0,0.0
    else: lo,hi=0.0,3000.0
    for _ in range(40):
        mid=(lo+hi)/2; a=g.buffer(mid,join_style=1).area/A
        if a<ratio: lo=mid
        else: hi=mid
    return g.buffer((lo+hi)/2,join_style=1)
out=[]
lakeU=transform(fw,lake)
for nombre,valor,ratio in [("217 msnm (sim.)",217,0.705),("219,5 msnm (sim.)",219.5,0.85),("222,5 msnm (ref.)",222.5,1.0),("223,5 msnm (sim.)",223.5,1.06)]:
    g=at_ratio2(lakeU,ratio).simplify(15)
    gw=transform(bw,g).buffer(0)
    m=mapping(gw)
    out.append({"id":f"YG{str(valor).replace('.','_')}","nombre":nombre,"valor":valor,"grupo":"yguazu","area_km2":round(g.area/1e6,1),"archivo":"Simulación ilustrativa","embebido":True,"simulado":ratio!=1,"geom":{"type":m["type"],"coordinates":rnd(m["coordinates"])}})
    print(nombre, round(g.area/1e6,1))
# superficies intermedias cada 0,5 m (ocultas en el panel; las usa el nivel automático)
import numpy as np
CURVA=json.load(open('hydro.json'))['curva']
for c in np.arange(216.5,223.51,0.5):
    c=round(float(c),1)
    if c in (217.0,219.5,222.5,223.5): continue
    ratio=float(np.interp(c,[p[0] for p in CURVA],[p[1] for p in CURVA]))/431.3
    g=at_ratio2(lakeU,ratio).simplify(25); gw=transform(bw,g).buffer(0); m=mapping(gw)
    out.append({"id":f"YGA{str(c).replace('.','_')}","nombre":f"{str(c).replace('.',',')} msnm","valor":c,"grupo":"yguazu","area_km2":round(g.area/1e6,1),"archivo":"Simulación ilustrativa","embebido":True,"simulado":True,"auto":True,"geom":{"type":m["type"],"coordinates":rnd(m["coordinates"])}})
# Acaray: solo aguas arriba de la presa (excluye el tramo de caudal reducido)
cU=transform(fw,cauce)
dam=transform(fw,box(-54.66,-25.53,-54.55,-25.462))
up=cU.difference(dam)
for nombre,valor,ratio in [("167,4 msnm (sim.)",167.4,0.5),("178 msnm (sim.)",178,0.75),("185,2 msnm (ref.)",185.2,1.0)]:
    g=at_ratio2(up,ratio).simplify(8)
    gw=transform(bw,g).buffer(0); m=mapping(gw)
    out.append({"id":f"AC{str(valor).replace('.','_')}","nombre":nombre,"valor":valor,"grupo":"acaray","area_km2":round(g.area/1e6,1),"archivo":"Simulación ilustrativa","embebido":True,"simulado":ratio!=1,"geom":{"type":m["type"],"coordinates":rnd(m["coordinates"])}})
    print(nombre, round(g.area/1e6,1))
sc=json.load(open('scenarios.json'))
sc=[s for s in sc if s.get('grupo','crecida')=='crecida']
for s in sc: s['grupo']='crecida'
for o in out:
    o["referencia"]="(ref.)" in o["nombre"]; o["nombre"]=o["nombre"].replace(" (sim.)","").replace(" (ref.)",""); o["archivo"]="Contorno de referencia" if o["referencia"] else "Simulación ilustrativa"
json.dump(sc+out,open('scenarios.json','w'),separators=(',',':'))
import os; print(os.path.getsize('scenarios.json'))
