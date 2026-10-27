import json, re, pickle, unicodedata
import xml.etree.ElementTree as ET
from shapely.geometry import Point, shape
K='{http://www.opengis.net/kml/2.2}'
G=pickle.load(open('geo.pkl','rb'))
districts=G['districts']; lake=G['lake']
b=json.load(open('basemap.json')); cauce=shape(b['cauceAcaray']['features'][0]['geometry'])
FIX={"ALTO PARANA":"Alto Paraná","CAAGUAZU":"Caaguazú","CANINDEYU":"Canindeyú"}
import build_geo_fix as BF
def dist_of(p):
    for n,d,g in districts:
        if g.contains(p): return BF.FIX.get(n,n), d
    return "",""
def nfc(s): return unicodedata.normalize('NFC',s.replace('\xa0',' ')).strip()
# --- estaciones ---
r=ET.parse('kmz/est/doc.kml').getroot(); est=[]
for pm in r.iter(K+'Placemark'):
    nm=nfc(pm.findtext(K+'name') or ''); desc=nfc(pm.findtext(K+'description') or '')
    lon,lat=[float(x) for x in pm.find('.//'+K+'coordinates').text.strip().split(',')[:2]]
    m=re.match(r'^(AY\s?\d+)\s*(.*)$',nm,re.I); code=m.group(1).upper().replace(' ','') if m else nm; rest=m.group(2) if m else ''
    txt=(nm+' '+desc).lower()
    tipos=[t for k,t in [('hidrometeorol','Hidrometeorológica'),('hidrom','Hidrométrica'),('pluvi','Pluviométrica'),('meteorol','Meteorológica'),('limnim','Limnimétrica')] if k in txt]
    if 'Hidrometeorológica' in tipos: tipos=['Hidrometeorológica']
    if 'Meteorológica' in tipos and 'Hidrometeorológica' in tipos: tipos.remove('Meteorológica')
    nombre=re.sub(r'\s*(Hidrom[eé]trica|Pluviom[eé]trica|Meteorol[oó]gica|Limnim[eé]trica|Hidrometeorol[oó]gica|\+)\s*',' ',rest,flags=re.I).strip() or nm
    if 'hidrometeorol' in txt and not rest.strip(): nombre=nm
    d,dep=dist_of(Point(lon,lat))
    nota=desc if desc and not re.match(r'^-?\d',desc) and desc.lower() not in ('hidrometrica',) else ''
    est.append({"codigo":code,"nombre":nombre,"tipo":" y ".join(tipos) or "Sin especificar","lat":round(lat,6),"lon":round(lon,6),"distrito":d,"departamento":dep,"nota":nota})
json.dump(est,open('stations.json','w'),ensure_ascii=False,separators=(',',':'))
for e in est: print(e['codigo'],'|',e['nombre'],'|',e['tipo'],'|',e['distrito'],'|',e['nota'])
# --- sitios ---
r=ET.parse('kmz/sit/doc.kml').getroot(); sites=[]; seen=set(); n=0
CAT={"Sit Turisticos, religiosos o de esparcimiento":"Turístico, religioso o de esparcimiento","Sit agricolas o industriales":"Agrícola o industrial","Sit. Urbanos o Civiles":"Urbano o civil","Balsas":"Balsa"}
for fo in r.iter(K+'Folder'):
    fn=nfc(fo.findtext(K+'name') or '')
    if fn.startswith('Estaciones'): continue
    cat=CAT.get(fn,fn)
    for pm in fo.findall(K+'Placemark'):
        nm=nfc(pm.findtext(K+'name') or ''); desc=nfc(pm.findtext(K+'description') or '')
        lon,lat=[float(x) for x in pm.find('.//'+K+'coordinates').text.strip().split(',')[:2]]
        key=(nm.lower(),round(lat,4),round(lon,4))
        if key in seen: continue
        seen.add(key)
        low=nm.lower()
        if cat=="Balsa": tipo="Embarcadero o balsa"
        elif cat=="Agrícola o industrial": tipo="Unidad productiva"
        elif re.search(r'com(unid(ad)?)?\.? indig|comunidad indigena|yvy moroti',low) or 'comunidad indigena' in desc.lower(): tipo="Comunidad indígena"
        elif cat=="Urbano o civil": tipo="Sitio urbano o civil"
        elif re.search(r'congregaci|iglesia|capilla',low): tipo="Institución"
        else: tipo="Balneario o recreativo"
        p=Point(lon,lat); d,dep=dist_of(p)
        dl=lake.exterior.distance(p)*104000 if not lake.contains(p) else 0
        dc=cauce.boundary.distance(p)*104000 if not cauce.contains(p) else 0
        emb="Yguazú" if dl<=dc else "Acaray"
        n+=1
        obs="Sitio de interés relevado por el equipo social (categoría: "+cat.lower()+")."+((" "+desc+".") if desc and not re.match(r'^-?\d',desc) else "")
        sites.append({"codigo":f"SI-{'YG' if emb=='Yguazú' else 'AC'}-{n:03d}","embalse":emb,"departamento":dep,"distrito":d,"localidad":"","latitud":round(lat,6),"longitud":round(lon,6),
                      "tipo_unidad":tipo,"nombre_sitio":nm,"categoria_sitio":cat,"encuestador":"Equipo social ANDE","estado_ficha":"Visitada por el equipo","observaciones":obs})
json.dump(sites,open('sites.json','w'),ensure_ascii=False,separators=(',',':'))
import collections
print(len(sites), collections.Counter(s['tipo_unidad'] for s in sites), collections.Counter(s['embalse'] for s in sites), collections.Counter(s['distrito'] for s in sites))
