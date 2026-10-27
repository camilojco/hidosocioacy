"""Construye la cartografía base embebida del visor (distritos, embalse, ríos, rutas)."""
import json
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

BBOX = box(-56.9, -26.4, -53.9, -24.2)
TOL = 0.0015


def rnd(obj, nd=4):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(obj[0], nd), round(obj[1], nd)]
        return [rnd(o, nd) for o in obj]
    return obj


def feat(geom, props):
    m = mapping(geom)
    return {"type": "Feature", "properties": props,
            "geometry": {"type": m["type"], "coordinates": rnd(m["coordinates"])}}


DEPFIX = {"ALTO PARANA": "Alto Paraná", "CAAGUAZU": "Caaguazú", "CANINDEYU": "Canindeyú", "ITAPUA": "Itapúa", "CAAZAPA": "Caazapá", "SAN PEDRO": "San Pedro"}
adm1 = [(f["properties"]["shapeName"], shape(f["geometry"]))
        for f in json.load(open("pry_adm1.geojson"))["features"]]

# Nombres con acentos y grafía usual
FIX = {
    "3 De Febrero": "3 de Febrero", "Ciudad Del Este": "Ciudad del Este",
    "Dr. Juan Leon Mallorquin": "Dr. Juan León Mallorquín",
    "Dr. Juan Manuel Frutos": "Dr. Juan Manuel Frutos",
    "J Eulogio Estigarribia": "Dr. J. Eulogio Estigarribia",
    "Jose Domingo Ocampos": "José Domingo Ocampos",
    "Juan E. O´Leary": "Juan E. O'Leary", "Mcal. Francisco Solano Lopez": "Mcal. Francisco S. López",
    "Minga Guazu": "Minga Guazú", "Raul Arsenio Oviedo": "Raúl Arsenio Oviedo",
    "Tembiapora": "Tembiaporã", "Yguazu": "Yguazú", "Santa Fe Del Parana": "Santa Fe del Paraná",
    "Minga Pora": "Minga Porã", "Mbaracayu": "Mbaracayú", "Yhu": "Yhú", "Repatriacion": "Repatriación",
    "Vaqueria": "Vaquería", "Abai": "Abaí", "Paso Yobai": "Paso Yobái",
}
districts = []
for f in json.load(open("pry_adm2.geojson"))["features"]:
    g = shape(f["geometry"])
    if not g.intersects(BBOX):
        continue
    name = f["properties"]["shapeName"]
    rp = g.representative_point()
    dep = next((n for n, p in adm1 if p.contains(rp)), "")
    dep = DEPFIX.get(dep.upper(), dep.title())
    gs = g.intersection(BBOX).simplify(TOL, preserve_topology=True)
    districts.append((FIX.get(name, name), dep, g, gs))

lake = None
for f in json.load(open("lakes.geojson"))["features"]:
    g = shape(f["geometry"])
    if g.intersects(box(-55.7, -25.45, -54.9, -24.95)) and f["properties"].get("name") is None:
        lake = g
lake_s = lake.simplify(0.0008, preserve_topology=True)

rivers, roads = [], []
for f in json.load(open("ne_rivers_lake_centerlines.geojson"))["features"]:
    g = shape(f["geometry"])
    if g.intersects(BBOX):
        nm = f["properties"].get("name") or "Acaray"
        rivers.append(feat(g.intersection(BBOX).simplify(0.001), {"nombre": "Río " + nm}))
for f in json.load(open("ne_roads.geojson"))["features"]:
    g = shape(f["geometry"])
    if g.intersects(BBOX):
        roads.append(feat(g.intersection(BBOX).simplify(0.001),
                          {"jerarquia": "principal" if f["properties"]["scalerank"] <= 4 else "secundaria"}))

# Presas: Acaray (coordenadas publicadas); Yguazú aproximada en el extremo oriental del espejo
east = max(lake.exterior.coords, key=lambda c: c[0])
dams = [
    {"nombre": "Presa Acaray", "lat": -25.4594, "lon": -54.6292, "nota": "Central Hidroeléctrica Acaray, Hernandarias"},
    {"nombre": "Presa Yguazú", "lat": round(east[1], 4), "lon": round(east[0], 4), "nota": "Ubicación aproximada"},
]

DEPS_DEPTO = {"Alto Paraná", "Caaguazú", "Canindeyú"}
geo = {
    "distritos": {"type": "FeatureCollection", "features": [
        feat(gs, {"nombre": n, "depto": d, "lp": [round(gs.representative_point().y, 4), round(gs.representative_point().x, 4)]}) for n, d, g, gs in districts if not gs.is_empty]},
    "embalseYguazu": {"type": "FeatureCollection", "features": [feat(lake_s, {"nombre": "Embalse Yguazú"})]},
    "rios": {"type": "FeatureCollection", "features": rivers},
    "rutas": {"type": "FeatureCollection", "features": roads},
    "presas": dams,
}
json.dump(geo, open("basemap.json", "w"), ensure_ascii=False, separators=(",", ":"))

# Insumos para el generador de datos
import pickle
pickle.dump({"districts": [(n, d, g) for n, d, g, gs in districts], "lake": lake,
             "acaray": [shape(r["geometry"]) for r in rivers if r["properties"]["nombre"] == "Río Acaray"]},
            open("geo.pkl", "wb"))
import os
print("basemap bytes", os.path.getsize("basemap.json"), "districts", len(districts), "east dam", east)
