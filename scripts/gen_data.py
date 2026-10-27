"""Genera fichas ficticias del censo hidrosocial (entrega 1 embebida y entrega 2 de prueba)."""
import json, math, pickle, random
from shapely.geometry import Point
from shapely.ops import nearest_points

random.seed(20261027)
G = pickle.load(open("geo.pkl", "rb"))
lake = G["lake"]
from kmlparse import parse
from shapely.ops import unary_union
acaray = unary_union([g for d, g in parse("kml/071e0be6-Q700.kml")])
acaray_b = acaray.boundary
districts = G["districts"]
M_PER_DEG = 104000  # aproximación a -25° de latitud


def district_of(p):
    for n, d, g in districts:
        if g.contains(p):
            return n, d
    return None, None


NOMBRES_F = ["María", "Ramona", "Juana", "Rosa", "Liz", "Gladys", "Nilda", "Elena", "Mirian", "Teresa", "Carmen", "Sonia", "Ana", "Graciela", "Lourdes", "Zulma"]
NOMBRES_M = ["Juan", "Carlos", "Ramón", "Pedro", "Hugo", "Víctor", "Néstor", "Luis", "Ángel", "Francisco", "Derlis", "Óscar", "Rubén", "Pablo", "Celso", "Marcelino"]
APELLIDOS = ["Benítez", "González", "Martínez", "Ortiz", "Villalba", "Giménez", "Duarte", "Acosta", "Cáceres", "Báez", "Ramírez", "Aquino", "Fernández", "Ayala", "Rojas", "Insfrán", "Cabrera", "Ferreira", "Núñez", "Escobar", "Sanabria", "Coronel"]
SECTORES = ["Costa", "Puerto", "Arroyo", "Potrero", "Cañada", "Loma", "Isla", "Paso", "Rincón", "Ensenada"]

TIPOS = [("Hogar", 70), ("Unidad productiva", 13), ("Hogar con unidad productiva", 9), ("Balneario o recreativo", 3),
         ("Institución", 2), ("Embarcadero o balsa", 1.5)]
TENENCIA = [("Título de propiedad", 34), ("Derecho de ocupación (INDERT)", 22), ("Ocupación sin documento", 18),
            ("Arrendamiento", 10), ("Préstamo o cuidado", 8), ("Propiedad comunitaria indígena", 0), ("Por verificar", 8)]
FUENTE = [("Junta de Saneamiento", 30), ("Pozo somero propio", 30), ("Pozo profundo comunitario", 12),
          ("Toma directa del embalse", 12), ("Aljibe o agua de lluvia", 8), ("Compra de agua", 8)]
USOS = ["Consumo humano", "Higiene y lavado", "Abrevadero de ganado", "Riego", "Pesca de subsistencia",
        "Pesca comercial", "Recreación", "Turismo", "Acuicultura", "Transporte o cruce"]
ACT = [("Agricultura familiar", 28), ("Ganadería menor", 10), ("Pesca", 12), ("Turismo y recreación", 6),
       ("Comercio", 9), ("Trabajo asalariado", 22), ("Producción mecanizada", 6), ("Otra", 7)]
AFECT = ["Pozo somero", "Pesca", "Acceso del ganado al agua", "Cruce en balsa", "Turismo", "Riego", "Toma de agua"]
OBS = ["Familia reporta descenso del pozo en sequía de 2024.", "Solicitan información sobre el cronograma de obras.",
       "Acceso por camino vecinal, intransitable con lluvia.", "Referente prefiere comunicación en guaraní.",
       "Vivienda a pocos metros de la orilla; verificar cota del terreno.", "Pesca nocturna con red; venta en la ruta PY02.",
       "Abrevadero directo en el embalse para 15 cabezas.", "Interés en participar de la consulta pública.",
       "No se encontró al referente; datos aportados por vecino.", "Reporta reclamo anterior por erosión de la costa.", "", "", "", ""]


def wpick(pairs):
    tot = sum(w for _, w in pairs)
    r = random.uniform(0, tot)
    for v, w in pairs:
        r -= w
        if r <= 0:
            return v
    return pairs[-1][0]


def rand_shore_point(geom_kind):
    """Centro de un asentamiento cerca de la costa (fuera del agua)."""
    while True:
        if geom_kind == "Yguazú":
            ring = lake.exterior
            p0 = ring.interpolate(random.uniform(0, ring.length))
        else:
            p0 = acaray_b.interpolate(random.uniform(0, acaray_b.length))
        d = random.expovariate(1 / (0.009 if geom_kind == "Yguazú" else 0.0028))
        a = random.uniform(0, 2 * math.pi)
        p = Point(p0.x + d * math.cos(a) / 0.905, p0.y + d * math.sin(a))
        if (geom_kind == "Yguazú" and lake.contains(p)) or acaray.contains(p):
            continue
        n, dep = district_of(p)
        if n:
            return p, n, dep


def make_record(i, emb, p, dist, dep, localidad, tipo=None):
    tipo = tipo or wpick(TIPOS)
    if emb == "Yguazú":
        dist_m = int(lake.exterior.distance(p) * M_PER_DEG)
    else:
        dist_m = int(acaray_b.distance(p) * M_PER_DEG)
    dist_m = max(15, dist_m)
    hogar = tipo.startswith("Hogar") or tipo == "Comunidad indígena"
    fem = random.random() < 0.38
    nombre = f"{random.choice(NOMBRES_F if fem else NOMBRES_M)} {random.choice(APELLIDOS)}"
    if tipo == "Institución":
        nombre = random.choice(["Escuela Básica", "Unidad de Salud Familiar", "Capilla", "Comisión vecinal"]) + f" {localidad}"
    elif tipo == "Comunidad indígena":
        nombre = f"Comunidad (ficticia) {localidad}"
    integ = random.choice([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8]) if hogar else ""
    if tipo == "Comunidad indígena":
        integ = random.randint(60, 180)
    menores = (random.randint(0, max(0, integ - 1)) if isinstance(integ, int) and integ > 1 else 0) if hogar else ""
    if tipo == "Comunidad indígena":
        menores = int(integ * random.uniform(.35, .5))
    mayores = (random.choice([0, 0, 0, 1, 1, 2]) if hogar else "")
    ten = "Propiedad comunitaria indígena" if tipo == "Comunidad indígena" else wpick(TENENCIA)
    # franja: depende de la distancia a la costa
    if dist_m < 80:
        franja = wpick([("Dentro", 60), ("Colindante", 25), ("Por verificar", 15)])
    elif dist_m < 250:
        franja = wpick([("Dentro", 15), ("Colindante", 45), ("Fuera", 25), ("Por verificar", 15)])
    else:
        franja = wpick([("Fuera", 85), ("Colindante", 5), ("Por verificar", 10)])
    fuente = wpick(FUENTE)
    usos = {"Consumo humano"} if hogar else set()
    if fuente == "Toma directa del embalse":
        usos |= {"Consumo humano", "Higiene y lavado"}
    act = wpick(ACT)
    if tipo == "Balneario o recreativo":
        act = "Turismo y recreación"; usos |= {"Recreación", "Turismo"}
    if tipo == "Embarcadero o balsa":
        act = "Comercio"; usos |= {"Transporte o cruce"}
    if act == "Pesca":
        usos.add(random.choice(["Pesca de subsistencia", "Pesca comercial"]))
    for u in USOS:
        prob = 0.5 if dist_m < 300 else 0.12
        if u in ("Pesca de subsistencia", "Recreación", "Abrevadero de ganado", "Riego", "Higiene y lavado") and random.random() < prob * 0.6:
            usos.add(u)
    if tipo == "Unidad productiva" and random.random() < .2:
        usos.add("Acuicultura")
    if not usos:
        usos.add("Recreación")
    usos = [u for u in USOS if u in usos]
    score = sum(u in usos for u in ["Pesca de subsistencia", "Pesca comercial", "Abrevadero de ganado", "Riego", "Turismo", "Transporte o cruce", "Acuicultura"])
    dep_emb = "Alta" if score >= 3 or act in ("Pesca", "Turismo y recreación") else "Media" if score >= 1 else wpick([("Baja", 6), ("Ninguna", 4)])
    conoce = "Sí" if random.random() < (0.55 if dist_m < 400 else 0.3) else "No"
    preoc = min(5, max(1, round(random.gauss(3.6 if dep_emb in ("Alta", "Media") else 2.2, 1))))
    afect = []
    if fuente == "Pozo somero propio": afect.append("Pozo somero")
    if any(u.startswith("Pesca") for u in usos): afect.append("Pesca")
    if "Abrevadero de ganado" in usos: afect.append("Acceso del ganado al agua")
    if "Transporte o cruce" in usos: afect.append("Cruce en balsa")
    if "Turismo" in usos: afect.append("Turismo")
    if "Riego" in usos: afect.append("Riego")
    if fuente == "Toma directa del embalse": afect.append("Toma de agua")
    estado = wpick([("Relevada", 62), ("Validada", 30), ("Requiere revisita", 8)])
    day = random.randint(1, 26)
    month = random.choice([9, 10])
    if month == 10:
        day = min(day, 20)
    return {
        "codigo": f"HS-{'YG' if emb == 'Yguazú' else 'AC'}-{i:04d}",
        "fecha_relevamiento": f"2026-{month:02d}-{day:02d}",
        "encuestador": f"E{random.randint(1, 8):02d}",
        "embalse": emb,
        "departamento": dep,
        "distrito": dist,
        "localidad": localidad,
        "latitud": round(p.y, 6),
        "longitud": round(p.x, 6),
        "precision_gps_m": random.choice([3, 4, 5, 5, 6, 8, 10, 12, 15]),
        "tipo_unidad": tipo,
        "nombre_referente": nombre,
        "sexo_jefatura": ("Mujer" if fem else "Hombre") if hogar and tipo != "Comunidad indígena" else "",
        "integrantes": integ,
        "menores_14": menores,
        "mayores_65": mayores,
        "tenencia": ten,
        "franja_dominio": franja,
        "distancia_costa_m": dist_m,
        "fuente_agua_consumo": fuente,
        "usos_agua": "; ".join(usos),
        "actividad_principal": act,
        "dependencia_embalse": dep_emb,
        "conoce_descenso": conoce,
        "preocupacion_descenso": preoc,
        "afectaciones_previstas": "; ".join(afect) if afect else "Ninguna",
        "reclamo_previo": "Sí" if random.random() < 0.09 else "No",
        "estado_ficha": estado,
        "observaciones": random.choice(OBS),
    }


records = []
counters = {"Yguazú": 0, "Acaray": 0}
used_names = set()
for emb, nclusters in (("Yguazú", 30), ("Acaray", 15)):
    for c in range(nclusters):
        center, dist, dep = rand_shore_point(emb)
        while True:
            loc = f"{random.choice(SECTORES)} {random.choice(['Poty', 'Guazú', 'Mí', 'Ka’aguy', 'Ysyry', 'Yvy', 'Pyahu', 'Porã', 'Tuja', 'Karumbe'])}"
            if loc not in used_names:
                used_names.add(loc); break
        n = random.randint(3, 11)
        special = random.random() < 0.05
        for k in range(n):
            for _ in range(50):
                sc = 0.0035 if emb == "Yguazú" else 0.0013
                p = Point(center.x + random.gauss(0, sc), center.y + random.gauss(0, sc * 0.86))
                if (emb == "Yguazú" and lake.contains(p)) or acaray.contains(p):
                    continue
                dd, ddep = district_of(p)
                if dd:
                    break
            counters[emb] += 1
            tipo = "Comunidad indígena" if (special and k == 0) else None
            records.append(make_record(counters[emb], emb, p, dd, ddep, loc, tipo))

print("total", len(records), counters)
json.dump(records, open("entrega1.json", "w"), ensure_ascii=False)

# ---- Entrega 2: actualizaciones + nuevas + 2 con errores, en columnas "tipo Kobo" ----
upd = random.sample(records, 14)
entrega2 = []
for r in upd:
    r2 = dict(r)
    ch = random.choice(["estado", "fuente", "integ", "obs", "franja"])
    r2["estado_ficha"] = "Validada"
    if ch == "fuente": r2["fuente_agua_consumo"] = "Junta de Saneamiento"
    if ch == "integ" and isinstance(r2["integrantes"], int): r2["integrantes"] += 1
    if ch == "franja": r2["franja_dominio"] = random.choice(["Dentro", "Colindante"])
    r2["observaciones"] = ("Revisita: " + random.choice(["datos confirmados con el referente.", "se actualizó la composición del hogar.", "pozo seco desde agosto.", "se verificó ubicación con GPS de mano."]))
    r2["fecha_relevamiento"] = "2026-10-24"
    entrega2.append(r2)
for k in range(11):
    emb = "Yguazú" if k < 8 else "Acaray"
    p, dist, dep = rand_shore_point(emb)
    counters[emb] += 1
    r = make_record(counters[emb], emb, p, dist, dep, f"{random.choice(SECTORES)} {random.choice(['Jeguá', 'Ka’a', 'Yvoty', 'Pirá', 'Kokue', 'Mbói'])}")
    r["fecha_relevamiento"] = "2026-10-25"
    entrega2.append(r)
# errores intencionales
bad1 = dict(entrega2[-1]); bad1["codigo"] = f"HS-AC-{counters['Acaray']+1:04d}"; bad1["latitud"], bad1["longitud"] = bad1["longitud"], bad1["latitud"]
bad2 = dict(entrega2[-2]); bad2["codigo"] = f"HS-AC-{counters['Acaray']+2:04d}"; bad2["latitud"] = ""; bad2["longitud"] = ""; bad2["observaciones"] = "GPS sin señal; tomar coordenadas en la revisita."; bad2["estado_ficha"] = "Requiere revisita"
entrega2 += [bad1, bad2]
json.dump(entrega2, open("entrega2.json", "w"), ensure_ascii=False)
print("entrega2", len(entrega2))
