import glob
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import transform
import pyproj
K='{http://www.opengis.net/kml/2.2}'
tr=pyproj.Transformer.from_crs(4326,32721,always_xy=True).transform
def parse(f):
    root=ET.parse(f).getroot(); out=[]
    for pm in root.iter(K+'Placemark'):
        polys=[]
        for pg in pm.iter(K+'Polygon'):
            def ring(el):
                t=el.find('.//'+K+'coordinates').text.split()
                return [tuple(map(float,c.split(',')[:2])) for c in t]
            ob=ring(pg.find(K+'outerBoundaryIs'))
            ib=[ring(x) for x in pg.findall(K+'innerBoundaryIs')]
            polys.append(Polygon(ob,ib))
        data={sd.get('name'):sd.text for sd in pm.iter(K+'SimpleData')}
        out.append((data,MultiPolygon(polys) if len(polys)>1 else polys[0]))
    return out
